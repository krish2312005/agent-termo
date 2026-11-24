import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheckpoint } from '../../src/runtime/checkpoints.js';
import { runToolLoop, formatToolResultForModel } from '../../src/main.js';
import type { ConversationMessage, ToolCall } from '../../src/types/index.js';
import type { NimClient } from '../../src/llm/client.js';

describe('agent tool-loop orchestration', () => {
	it('feeds a terminal failure into read, edit, and repeated verification', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-'));
		const filePath = 'fixture.ts';
		const absolutePath = join(projectRoot, filePath);
		const verificationCommand = 'node --test';
		writeFileSync(absolutePath, 'const status = "broken";\n', 'utf8');
		writeFileSync(join(projectRoot, 'fixture.test.js'), [
			'const { test } = require("node:test");',
			'const assert = require("node:assert/strict");',
			'const { readFileSync } = require("node:fs");',
			'test("fixture is fixed", () => {',
			'  assert.match(readFileSync("fixture.ts", "utf8"), /fixed/, "fixture is fixed");',
			'});',
		].join('\n'), 'utf8');

		const responses: Array<{ content: string; toolCalls: ToolCall[] }> = [
			{ content: '', toolCalls: [{ id: 'read-1', name: 'file:read', arguments: { path: filePath } }] },
			{ content: '', toolCalls: [{ id: 'edit-1', name: 'file:edit', arguments: { path: filePath, old_string: 'broken', new_string: 'fixed' } }] },
			{ content: '', toolCalls: [{ id: 'verify-1', name: 'bash:execute', arguments: { command: verificationCommand } }] },
			{ content: 'Done: the source correction passed verification.', toolCalls: [] },
		];
		const providerRequests: ConversationMessage[][] = [];
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete(messages: ConversationMessage[]) {
				providerRequests.push(messages.map((message) => ({ ...message, toolCalls: message.toolCalls?.map((call) => ({ ...call, arguments: { ...call.arguments } })) })));
				const response = responses.shift();
				if (!response) throw new Error('Unexpected extra provider request');
				yield response;
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;

		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
			{ id: 'user', role: 'user', content: 'Fix the TypeScript error.', timestamp: new Date() },
		];
		const checkpoint = createCheckpoint(projectRoot, 'orchestration regression');
		const taskState = { goal: 'Fix the TypeScript error.', status: 'running' as const, reason: '', lastActions: [] as string[] };
		const initialCall: ToolCall = { id: 'bash-1', name: 'bash:execute', arguments: { command: verificationCommand } };

		try {
			const finalText = await runToolLoop(
				conversation,
				projectRoot,
				[initialCall],
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => checkpoint.id,
				() => undefined,
			);

			expect(finalText).toContain('passed verification');
			expect(readFileSync(absolutePath, 'utf8')).toContain('fixed');
			expect(conversation.filter((message) => message.role === 'tool')[0]?.content).toContain('fixture is fixed');
			expect(conversation.filter((message) => message.role === 'tool')[0]?.content).toContain('Exit code: 1');
			expect(conversation.filter((message) => message.role === 'tool').map((message) => message.id)).toEqual(['bash-1', 'read-1', 'edit-1', 'verify-1']);
			expect(providerRequests.some((messages) => messages.some((message) => message.role === 'tool' && message.content.includes('Error:')))).toBe(true);
			expect(formatToolResultForModel({ name: 'bash:execute', success: false, error: '' })).toContain('without details');
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});


	it('rejects missing required arguments before execution and accepts the corrected call', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-invalid-args-'));
		const marker = 'corrected-command-ran.txt';
		const command = `node -e "require('node:fs').writeFileSync('${marker}', 'ran')"`;
		const responses: Array<{ content: string; toolCalls: ToolCall[] }> = [
			{ content: '', toolCalls: [{ id: 'corrected-call', name: 'bash:execute', arguments: { command } }] },
			{ content: 'The corrected command ran successfully.', toolCalls: [] },
		];
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				const response = responses.shift();
				if (!response) throw new Error('Unexpected extra provider request');
				yield response;
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;
		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
		];
		const taskState = { goal: 'Run the required command.', status: 'running' as const, reason: '', lastActions: [] as string[] };

		try {
			const finalText = await runToolLoop(
				conversation,
				projectRoot,
				[{ id: 'missing-command', name: 'bash:execute', arguments: {} }],
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => '',
				() => undefined,
			);
			expect(finalText).toContain('corrected command ran successfully');
			expect(existsSync(join(projectRoot, marker))).toBe(true);
			expect(conversation.find((message) => message.role === 'tool')?.content).toContain('missing required argument(s): command');
			expect(responses).toHaveLength(0);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it('blocks root completion when a check command actually fails', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-gate-'));
		const filePath = 'fixture.ts';
		writeFileSync(join(projectRoot, 'fixture.test.js'), [
			'const { test } = require("node:test");',
			'test("verification fails", () => { throw new Error("unit test failed"); });',
		].join('\n'), 'utf8');
		const command = 'node --test';
		const responses: Array<{ content: string; toolCalls: ToolCall[] }> = [
			{ content: '', toolCalls: [{ id: 'failed-check', name: 'bash:execute', arguments: { command } }] },
			{ content: 'The implementation is complete.', toolCalls: [] },
		];
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				const response = responses.shift();
				if (!response) throw new Error('Unexpected extra provider request');
				yield response;
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;
		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
			{ id: 'user', role: 'user', content: 'Implement the fixture handler.', timestamp: new Date() },
		];
		const checkpoint = createCheckpoint(projectRoot, 'completion-gate regression');
		const taskState = { goal: 'Implement the fixture handler.', status: 'running' as const, reason: '', lastActions: [] as string[] };

		try {
			const finalText = await runToolLoop(
				conversation,
				projectRoot,
				[{ id: 'write-1', name: 'file:write', arguments: { path: filePath, content: 'export function handler() { return true; }' } }],
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => checkpoint.id,
				() => undefined,
			);

			expect(finalText).toBe('');
			expect(taskState.status).toBe('interrupted');
			expect(taskState.reason).toContain('unit test failed');
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it('stops duplicate empty file writes within the same model response', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-empty-write-'));
		let providerCalls = 0;
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				providerCalls++;
				throw new Error('The provider must not be called after duplicate invalid tool calls.');
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;
		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
		];
		const taskState = { goal: 'Create test files.', status: 'running' as const, reason: '', lastActions: [] as string[] };
		const duplicateCalls: ToolCall[] = Array.from({ length: 6 }, (_, index) => ({
			id: 'empty-write-' + index,
			name: 'file:write',
			arguments: {},
		}));

		try {
			await runToolLoop(
				conversation,
				projectRoot,
				duplicateCalls,
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => '',
				() => undefined,
			);

			const toolResults = conversation.filter((message) => message.role === 'tool');
			expect(taskState.status).toBe('interrupted');
			expect(taskState.reason).toContain('unchanged failed tool call');
			expect(providerCalls).toBe(0);
			expect(toolResults).toHaveLength(6);
			expect(toolResults[0]?.content).toContain('path is required');
			expect(toolResults[1]?.content).toContain('path is required');
			expect(toolResults.slice(2).every((message) =>
				message.content.includes('already failed and was requested again unchanged'),
			)).toBe(true);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it('pauses instead of executing an unchanged failed call forever', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-repeat-'));
		const command = `node -e "console.error('persistent failure'); process.exit(1)"`;
		let providerCalls = 0;
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				providerCalls++;
				yield { content: '', toolCalls: [{ id: 'repeat-2', name: 'bash:execute', arguments: { command } }] };
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;
		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
		];
		const taskState = { goal: 'Investigate the failure.', status: 'running' as const, reason: '', lastActions: [] as string[] };

		try {
			await runToolLoop(
				conversation,
				projectRoot,
				[{ id: 'repeat-1', name: 'bash:execute', arguments: { command } }],
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => '',
				() => undefined,
			);

			expect(taskState.status).toBe('interrupted');
			expect(taskState.reason).toContain('unchanged failed tool call');
			expect(providerCalls).toBe(2);
			expect(conversation.filter((message) => message.role === 'tool')).toHaveLength(3);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it('lets a previously failed call retry after a successful corrective write, then completes', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-retry-'));
		const filePath = 'target.txt';
		const absolutePath = join(projectRoot, filePath);
		const content = 'hello world';

		const responses: Array<{ content: string; toolCalls: ToolCall[] }> = [
			{ content: '', toolCalls: [{ id: 'write-1', name: 'file:write', arguments: { path: filePath, content } }] },
			{ content: '', toolCalls: [{ id: 'read-2', name: 'file:read', arguments: { path: filePath } }] },
			{ content: 'Done: the file was created and re-read.', toolCalls: [] },
		];
		let providerCalls = 0;
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				providerCalls++;
				const response = responses.shift();
				if (!response) throw new Error('Unexpected extra provider request');
				yield response;
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
			getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
			getModel: () => 'test-model',
		} as unknown as NimClient;

		const conversation: ConversationMessage[] = [
			{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() },
			{ id: 'user', role: 'user', content: 'Create target.txt and read it back.', timestamp: new Date() },
		];
		const checkpoint = createCheckpoint(projectRoot, 'retry-budget regression');
		const taskState = { goal: 'Create target.txt and read it back.', status: 'running' as const, reason: '', lastActions: [] as string[] };
		const initialCall: ToolCall = { id: 'read-1', name: 'file:read', arguments: { path: filePath } };

		try {
			const finalText = await runToolLoop(
				conversation,
				projectRoot,
				[initialCall],
				{ close() {}, showPrompt() {} },
				fakeClient,
				'auto',
				new Set(),
				taskState,
				() => checkpoint.id,
				() => undefined,
			);

			expect(finalText).toContain('Done');
			expect(readFileSync(absolutePath, 'utf8')).toBe(content);

			const toolResults = conversation.filter((message) => message.role === 'tool');
			// The first read failed because the file did not exist yet.
			expect(toolResults[0]?.content).toContain('Cannot read');
			expect(toolResults[0]?.content).toContain('Status: failure');
			// The corrective write succeeded and was applied.
			expect(toolResults[1]?.content).toContain('Status: success');
			expect(toolResults[1]?.content).toContain('(applied)');
			// The identical read ran again (not blocked) and now succeeded.
			expect(toolResults[2]?.id).toBe('read-2');
			expect(toolResults[2]?.content).toContain('Status: success');
			expect(toolResults[2]?.content).toContain(content);
			expect(toolResults[2]?.content).not.toContain('already failed and was requested again unchanged');
			expect(providerCalls).toBe(3);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
});
