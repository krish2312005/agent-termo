import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentTranscriptStore } from '../../src/runtime/agent-transcript.js';
import {
	agentActivityReportPath,
	agentWorkReportPath,
	writeAgentActivityReport,
} from '../../src/runtime/agent-reports.js';

describe('agent activity reports', () => {
	let projectRoot = '';

	afterEach(() => {
		if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
		projectRoot = '';
	});

	it('writes a factual tool trace and redacts command credentials', async () => {
		projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-agent-report-'));
		const transcript = createAgentTranscriptStore();
		transcript.append({ type: 'tool.start', agentId: 'run/1', callId: 'c1', name: 'file:write', args: 'docs/ARCHITECTURE.md', at: 1_000 });
		transcript.append({ type: 'tool.end', agentId: 'run/1', callId: 'c1', ok: true, result: 'applied docs/ARCHITECTURE.md', at: 1_050 });
		transcript.append({ type: 'tool.start', agentId: 'run/1', callId: 'c2', name: 'bash:execute', args: 'curl --token super-secret-token https://example.test', at: 1_100 });
		transcript.append({ type: 'tool.end', agentId: 'run/1', callId: 'c2', ok: true, result: 'done', at: 1_200 });

		const path = await writeAgentActivityReport(projectRoot, {
			agentName: 'backend-expert',
			agentId: 'run/1',
			task: 'Implement API docs',
			turn: 2,
			status: 'completed',
			startedAt: 1_000,
			endedAt: 1_300,
			entries: transcript.get('run/1'),
		});
		const report = readFileSync(join(projectRoot, path), 'utf8');

		expect(path).toBe(agentActivityReportPath('backend-expert', 'run/1', 2));
		expect(report).toContain('file:write');
		expect(report).toContain('docs/ARCHITECTURE.md');
		expect(report).toContain('bash:execute');
		expect(report).not.toContain('super-secret-token');
		expect(report).toContain('[REDACTED]');
		expect(report).not.toContain('done');
	});

	it('uses separate, predictable paths for work reports and activity logs', () => {
		expect(agentWorkReportPath('code-reviewer', 'run/1', 1)).toBe('docs/agent-reports/code-reviewer-run-1-turn-1.md');
		expect(agentActivityReportPath('code-reviewer', 'run/1', 1)).toBe('docs/agent-activity/code-reviewer-run-1-turn-1.md');
	});
});
