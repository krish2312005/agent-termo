import { afterEach, describe, expect, it } from 'vitest';
import { buildInspector } from '../../src/ui/subagent-view.js';
import { getSubAgent, resetSubAgents, spawnSubAgent, startSubAgentTool } from '../../src/runtime/subagents.js';

afterEach(() => resetSubAgents());

describe('sub-agent bash command display', () => {
\tit('preserves the full command in registry storage and renders it with its working directory', () => {
\t\tconst command = 'npm run typecheck && '.repeat(30) + 'npm test -- --run && printf "COMMAND_END_MARKER"';
\t\tconst cwd = '/Users/example/project/deep/workspace';
\t\tconst args = \`Command:\\n\${command}\\nWorking directory:\\n\${cwd}\`;
\t\tconst id = spawnSubAgent('request-1', 'test-agent', 'Run project checks', 8);
\t\tstartSubAgentTool(id, 'bash:execute', args);

\t\tconst activity = getSubAgent(id);
\t\texpect(activity?.tools[0]?.args).toBe(args);
\t\tconst inspector = buildInspector(activity!, 64, 2000);
\t\tconst rendered = inspector.body.join('\\n');

\t\texpect(rendered).toContain('Command:');
\t\texpect(rendered).toContain('Working directory:');
\t\texpect(rendered).toContain('COMMAND_END_MARKER');
\t\texpect(rendered).toContain(cwd);
\t\texpect(rendered).not.toContain('COMMAND_END_MARKER…');
\t});
});
