import { afterEach, describe, expect, it } from 'vitest';
import { buildInspector } from '../../src/ui/subagent-view.js';
import { getSubAgent, resetSubAgents, spawnSubAgent, startSubAgentTool } from '../../src/runtime/subagents.js';

afterEach(() => resetSubAgents());

describe('sub-agent bash command display', () => {
	it('preserves the full command in registry storage and renders it with its working directory', () => {
		const command = 'npm run typecheck && '.repeat(30) + '\nprintf "COMMAND_END_MARKER"\necho "second command line"';
		const cwd = '/Users/example/project/deep/workspace';
		const args = `Command:\n${command}\nWorking directory:\n${cwd}`;
		const id = spawnSubAgent('request-1', 'test-agent', 'Run project checks', 8);
		startSubAgentTool(id, 'bash:execute', args);

		const activity = getSubAgent(id);
		expect(activity?.tools[0]?.args).toBe(args);
		const inspector = buildInspector(activity!, 64, 2000);
		const rendered = inspector.body.join('\n');

		expect(rendered).toContain('Command:');
		expect(rendered).toContain('Working directory:');
		expect(rendered).toContain('COMMAND_END_MARKER');
		expect(rendered).toContain('second command line');
		expect(rendered).toContain(cwd);
		expect(rendered).not.toContain('COMMAND_END_MARKER…');
	});
});
