import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
		const verificationCommand = 'npm test';
		writeFileSync(absolutePath, 'const status = "broken";\n', 'utf8');
		writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
			scripts: { test: `node -e "const fs=require('fs'); if (!fs.readFileSync('fixture.ts','utf8').includes('fixed')) process.exit(1)"` },
		}), 'utf8');

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
			expect(conversation.filter((message) => message.role === 'tool')[0]?.content).toContain('TS2345: broken');
			expect(conversation.filter((message) => message.role === 'tool')[0]?.content).toContain('Exit code: 1');
			expect(conversation.filter((message) => message.role === 'tool').map((message) => message.id)).toEqual(['bash-1', 'read-1', 'edit-1', 'verify-1']);
			expect(providerRequests.some((messages) => messages.some((message) => message.role === 'tool' && message.content.includes('Error:')))).toBe(true);
			expect(formatToolResultForModel({ name: 'bash:execute', success: false, error: '' })).toContain('without details');
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	it('pauses after repeated successful read-only discovery without workspace progress', async () => {
		const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-loop-discovery-'));
		writeFileSync(join(projectRoot, 'fixture.ts'), 'export const value = 1;\\n', 'utf8');
		let providerCalls = 0;
		const fakeClient = {
			buildToolDefs: () => [],
			async *streamComplete() {
				providerCalls++;
				yield { content: '', toolCalls: [{ id: 'read-' + providerCalls, name: 'file:read', arguments: { path: 'fixture.ts' } }] };
			},
			complete: async () => ({ content: '', toolCalls: [] }),
			formatUsage: () => '0 tokens',
		} as unknown as NimClient;
		const conversation: ConversationMessage[] = [{ id: 'system', role: 'system', content: 'You are a coding agent.', timestamp: new Date() }];
		const taskState = { goal: 'Implement a feature in this project.', status: 'running' as const, reason: '', lastActions: [] as string[] };
		try {
			await runToolLoop(conversation, projectRoot, [{ id: 'read-initial', name: 'file:read', arguments: { path: 'fixture.ts' } }],
				{ close() {}, showPrompt() {} }, fakeClient, 'files', new Set(), taskState, () => '', () => undefined);
			expect(taskState.status).toBe('interrupted');
			expect(taskState.reason).toContain('ten consecutive read-only');
			expect(providerCalls).toBe(9);
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
			expect(providerCalls).toBe(1);
			expect(conversation.filter((message) => message.role === 'tool')).toHaveLength(2);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
});
