import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { getAgentTermoDir } from '../utils/config.js';
import type { ToolDef, ToolParameter } from '../types/index.js';

export type McpConfigScope = 'project' | 'user';

export interface McpServerConfig {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	disabled?: boolean;
}

interface McpConfigFile {
	mcpServers?: Record<string, McpServerConfig>;
}

interface ServerStatus {
	name: string;
	connected: boolean;
	tools: number;
	error?: string;
}

interface ActiveServer {
	name: string;
	client: InstanceType<typeof Client>;
	transport: any;
}

interface DiscoveredTool {
	serverName: string;
	toolName: string;
	client: InstanceType<typeof Client>;
	definition: ToolDef;
}

const CLIENT_VERSION = '1.0.15';
const activeServers = new Map<string, ActiveServer>();
const serverStatuses = new Map<string, ServerStatus>();
const discoveredTools = new Map<string, DiscoveredTool>();

function configPath(projectRoot: string, scope: McpConfigScope): string {
	return scope === 'user'
		? resolve(getAgentTermoDir(), 'mcp.json')
		: resolve(projectRoot, '.agent-termo', 'mcp.json');
}

function readConfigFile(path: string): Record<string, McpServerConfig> {
	if (!existsSync(path)) return {};
	const parsed = JSON.parse(readFileSync(path, 'utf-8')) as McpConfigFile;
	if (!parsed || typeof parsed !== 'object' || !parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
		throw new Error('Invalid MCP config at ' + path + ': expected an object named "mcpServers".');
	}
	return parsed.mcpServers;
}

export function loadMcpServerConfigs(projectRoot: string): Record<string, McpServerConfig> {
	return {
		...readConfigFile(configPath(projectRoot, 'user')),
		...readConfigFile(configPath(projectRoot, 'project')),
	};
}

function writeConfigFile(projectRoot: string, scope: McpConfigScope, servers: Record<string, McpServerConfig>): void {
	const path = configPath(projectRoot, scope);
	const directory = resolve(path, '..');
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
	if (process.platform !== 'win32') chmodSync(path, 0o600);
}

export function saveMcpServerConfig(projectRoot: string, name: string, config: McpServerConfig, scope: McpConfigScope = 'project'): void {
	const servers = readConfigFile(configPath(projectRoot, scope));
	servers[name] = config;
	writeConfigFile(projectRoot, scope, servers);
}

export function removeMcpServerConfig(projectRoot: string, name: string, scope: McpConfigScope = 'project'): void {
	const servers = readConfigFile(configPath(projectRoot, scope));
	if (!servers[name]) throw new Error('MCP server "' + name + '" was not found in ' + scope + ' configuration.');
	delete servers[name];
	writeConfigFile(projectRoot, scope, servers);
}

export function setMcpServerEnabled(projectRoot: string, name: string, enabled: boolean, scope: McpConfigScope = 'project'): void {
	const servers = readConfigFile(configPath(projectRoot, scope));
	const config = servers[name];
	if (!config) throw new Error('MCP server "' + name + '" was not found in ' + scope + ' configuration.');
	servers[name] = { ...config, disabled: !enabled };
	writeConfigFile(projectRoot, scope, servers);
}

function expandEnvironment(value: string): string {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, variable: string) => {
		const resolved = process.env[variable];
		if (resolved === undefined) throw new Error('Missing environment variable "' + variable + '" required by MCP configuration.');
		return resolved;
	});
}

function configEnvironment(values: Record<string, string> | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(values ?? {})) result[key] = expandEnvironment(value);
	return result;
}

function toolSlug(value: string): string {
	const slug = value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
	return slug || 'tool';
}

function modelToolName(serverName: string, toolName: string): string {
	return 'mcp_' + toolSlug(serverName).slice(0, 20) + '_' + toolSlug(toolName).slice(0, 40);
}

function validateServerConfig(name: string, config: McpServerConfig): void {
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		throw new Error('MCP server "' + name + '" must be a configuration object.');
	}
	const hasHttp = typeof config.url === 'string' && config.url.trim().length > 0;
	const hasStdio = typeof config.command === 'string' && config.command.trim().length > 0;
	if (hasHttp === hasStdio) throw new Error('MCP server "' + name + '" must define exactly one of url or command.');
	if (hasHttp) {
		const url = new URL(expandEnvironment(config.url!));
		if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('MCP server "' + name + '" URL must use HTTP or HTTPS.');
		return;
	}
	if (config.args !== undefined && (!Array.isArray(config.args) || !config.args.every((arg) => typeof arg === 'string'))) {
		throw new Error('MCP server "' + name + '" args must be an array of strings.');
	}
}

async function connectServer(projectRoot: string, name: string, config: McpServerConfig): Promise<{
	client: InstanceType<typeof Client>;
	transport: any;
	tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
}> {
	validateServerConfig(name, config);
	const client = new Client({ name: 'agent-termo', version: CLIENT_VERSION });
	let transport: any;

	if (config.url) {
		const headers = configEnvironment(config.headers);
		transport = new StreamableHTTPClientTransport(new URL(expandEnvironment(config.url)), {
			requestInit: { headers },
		});
	} else {
		transport = new StdioClientTransport({
			command: expandEnvironment(config.command!),
			args: (config.args ?? []).map(expandEnvironment),
			env: configEnvironment(config.env),
			cwd: config.cwd ? resolve(projectRoot, expandEnvironment(config.cwd)) : projectRoot,
		});
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const connection = (async () => {
			await client.connect(transport);
			const result = await client.listTools();
			return { client, transport, tools: result.tools as Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
		})();
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				void client.close().catch(() => undefined);
				reject(new Error('MCP server "' + name + '" did not initialize within 15 seconds.'));
			}, 15_000);
		});
		return await Promise.race([connection, timeout]);
	} catch (error) {
		try { await client.close(); } catch { /* connection may not have opened */ }
		throw error;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function closeConnection(connection: ActiveServer): Promise<void> {
	try {
		if (typeof connection.transport?.terminateSession === 'function') await connection.transport.terminateSession();
	} catch { /* close still releases the client transport */ }
	try { await connection.client.close(); } catch { /* already disconnected */ }
}

function removeDiscoveredTools(serverName: string): void {
	for (const [name, tool] of discoveredTools) {
		if (tool.serverName === serverName) discoveredTools.delete(name);
	}
	const status = serverStatuses.get(serverName);
	if (status) status.tools = 0;
}

export async function initializeMcpServers(projectRoot: string): Promise<ServerStatus[]> {
	await shutdownMcpServers();
	serverStatuses.clear();
	let configs: Record<string, McpServerConfig>;
	try {
		configs = loadMcpServerConfigs(projectRoot);
	} catch (error) {
		return [{ name: 'configuration', connected: false, tools: 0, error: error instanceof Error ? error.message : String(error) }];
	}

	for (const [name, config] of Object.entries(configs)) {
		const status: ServerStatus = { name, connected: false, tools: 0 };
		serverStatuses.set(name, status);
		let pendingConnection: ActiveServer | undefined;
		try {
			if (config?.disabled === true) continue;
			validateServerConfig(name, config);
			const connected = await connectServer(projectRoot, name, config);
			const connection: ActiveServer = { name, client: connected.client, transport: connected.transport };
			pendingConnection = connection;
			const pending: Array<[string, DiscoveredTool]> = [];
			for (const tool of connected.tools) {
				const modelName = modelToolName(name, tool.name);
				if (discoveredTools.has(modelName) || pending.some(([existing]) => existing === modelName)) {
					throw new Error('MCP tool name collision for "' + modelName + '". Rename the server or tool to make its name unique.');
				}
				const schema = tool.inputSchema && typeof tool.inputSchema === 'object'
					? tool.inputSchema
					: { type: 'object', properties: {} };
				if (schema.type !== 'object') throw new Error('MCP tool "' + tool.name + '" has an unsupported non-object input schema.');
				const parameters = {
					...schema,
					type: 'object',
					properties: schema.properties ?? {},
				} as unknown as ToolParameter;
				pending.push([modelName, {
					serverName: name,
					toolName: tool.name,
					client: connected.client,
					definition: {
						name: modelName,
						description: '[MCP server: ' + name + '] ' + (tool.description || tool.name),
						parameters,
					},
				}]);
			}

			activeServers.set(name, connection);
			pendingConnection = undefined;
			for (const [modelName, tool] of pending) discoveredTools.set(modelName, tool);
			status.connected = true;
			status.tools = pending.length;

			const previousOnClose = connected.transport.onclose;
			connected.transport.onclose = () => {
				previousOnClose?.();
				activeServers.delete(name);
				removeDiscoveredTools(name);
				status.connected = false;
			};
			const previousOnError = connected.transport.onerror;
			connected.transport.onerror = (error: Error) => {
				previousOnError?.(error);
				status.error = error.message;
			};
		} catch (error) {
			if (pendingConnection) await closeConnection(pendingConnection);
			status.error = error instanceof Error ? error.message : String(error);
			status.connected = false;
		}
	}
	return getMcpServerStatuses();
}

export function getMcpServerStatuses(): ServerStatus[] {
	return [...serverStatuses.values()].map((status) => ({ ...status }));
}

export function getMcpToolDefinitions(): ToolDef[] {
	return [...discoveredTools.values()].map((tool) => tool.definition);
}

export function isMcpToolName(name: string): boolean {
	return discoveredTools.has(name);
}

export async function executeMcpTool(name: string, args: Record<string, unknown>): Promise<{
	success: boolean;
	output?: string;
	error?: string;
}> {
	const tool = discoveredTools.get(name);
	if (!tool) return { success: false, error: 'MCP tool is not connected: ' + name };

	try {
		const result = await tool.client.callTool({ name: tool.toolName, arguments: args });
		const content = Array.isArray(result.content) ? result.content.map((item: any) => {
			if (item.type === 'text') return item.text;
			if (item.type === 'image') return '[Image result: ' + (item.mimeType || 'unknown type') + ']';
			return JSON.stringify(item);
		}).filter(Boolean).join('\n') : '';
		const structured = result.structuredContent === undefined ? '' : '\nStructured result: ' + JSON.stringify(result.structuredContent);
		const output = (content + structured).trim() || '(MCP tool returned no content)';
		return result.isError ? { success: false, error: output } : { success: true, output };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export async function testMcpServer(projectRoot: string, name: string): Promise<string[]> {
	const config = loadMcpServerConfigs(projectRoot)[name];
	if (!config) throw new Error('MCP server "' + name + '" is not configured.');
	const connected = await connectServer(projectRoot, name, config);
	try {
		return connected.tools.map((tool) => tool.name);
	} finally {
		await closeConnection({ name, client: connected.client, transport: connected.transport });
	}
}

export async function shutdownMcpServers(): Promise<void> {
	const connections = [...activeServers.values()];
	activeServers.clear();
	discoveredTools.clear();
	for (const status of serverStatuses.values()) {
		status.connected = false;
		status.tools = 0;
	}
	await Promise.all(connections.map(closeConnection));
}
