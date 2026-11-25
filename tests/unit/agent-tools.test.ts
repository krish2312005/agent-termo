import { describe, expect, it } from 'vitest';
import { filterAgentTools } from '../../src/agents/index.js';
import { TOOL_DEFINITIONS } from '../../src/llm/tools.js';

describe('agent documentation tool access', () => {
	it('gives every agent the restricted docs writer without broadening its code-write permissions', () => {
		const reviewer = {
			name: 'code-reviewer',
			description: 'Read-only code review',
			systemPrompt: 'Review only.',
			tools: ['file:read', 'file:glob'],
		};
		const names = filterAgentTools(reviewer, TOOL_DEFINITIONS).map((tool) => tool.name);

		expect(names).toContain('docs:write');
		expect(names).toContain('file:read');
		expect(names).not.toContain('file:write');
		expect(names).not.toContain('agent:delegate');
	});
});
