import { describe, expect, it } from 'vitest';
import { buildInspector } from '../../src/ui/subagent-view.js';
import type { SubAgentActivity } from '../../src/runtime/subagents.js';

describe('sub-agent bash command display', () => {
	it('renders the tail of long multiline commands and their working directory', () => {
		const command = 'npm run typecheck && '.repeat(30) + 'npm test -- --run && printf "COMMAND_END_MARKER"';
		const cwd = '/Users/example/project/deep/workspace';
		const activity: SubAgentActivity = {
			id: 'sub-agent-1',
			runId: 1,
			agent: 'test-agent',
			task: 'Run project checks',
			status: 'running',
			activity: 'bash:execute',
			step: 1,
			budget: 8,
			startedAt: 1000,
			tools: [{
				name: 'bash:execute',
				args: `Command:\n${command}\nWorking directory:\n${cwd}`,
				startedAt: 1000,
			}],
			progress: [],
		};

		const inspector = buildInspector(activity, 64, 2000);
		const rendered = inspector.body.join('\n');
		expect(rendered).toContain('Command:');
		expect(rendered).toContain('Working directory:');
		expect(rendered).toContain('COMMAND_END_MARKER');
		expect(rendered).toContain(cwd);
		expect(rendered).not.toContain('COMMAND_END_MARKER…');
	});
});
