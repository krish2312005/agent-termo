import { describe, expect, it } from 'vitest';
import {
	MalformedModelOutputError,
	MALFORMED_MODEL_OUTPUT_MESSAGE,
	isDegenerateModelOutput,
} from '../../src/llm/client.js';
import { getProviderModelLimits } from '../../src/llm/models.js';
import { isTransientError } from '../../src/main.js';

describe('isDegenerateModelOutput', () => {
	it('ignores normal prose', () => {
		expect(isDegenerateModelOutput('Here is the fix you asked for.')).toBe(false);
		expect(isDegenerateModelOutput('')).toBe(false);
	});

	it('ignores legitimate tool-call markup', () => {
		const markup = '<tool_call><function=file_read><parameter name="path">src/main.ts</parameter></function></tool_call>';
		expect(isDegenerateModelOutput(markup)).toBe(false);
	});

	it('ignores raw control tokens that do not repeat', () => {
		expect(isDegenerateModelOutput('<|open|>argument<|sep|><|close|>message<|sep|>')).toBe(false);
	});

	it('detects the same non-empty line repeated consecutively', () => {
		expect(isDegenerateModelOutput('normal\n<|close|>message<|sep|>')).toBe(false);
		const repeated = Array.from({ length: 6 }, () => '<|close|>message<|sep|>').join('\n');
		expect(isDegenerateModelOutput(repeated)).toBe(true);
	});

	it('detects repeated <|close|>message<|sep|> with no line breaks', () => {
		const inline = '<|open|>argument<|sep|>' + '<|close|>message<|sep|>'.repeat(6);
		expect(isDegenerateModelOutput(inline)).toBe(true);
	});
});

describe('MalformedModelOutputError', () => {
	it('is non-retryable so it is not mistaken for a transient failure', () => {
		const error = new MalformedModelOutputError(MALFORMED_MODEL_OUTPUT_MESSAGE);
		expect(error.retryable).toBe(false);
		expect(isTransientError(error)).toBe(false);
	});
});

describe('nemotron model limit', () => {
	it('uses the user-reported 262K context window', () => {
		expect(getProviderModelLimits('nvidia/nemotron-3.5-super-vl-120b-a12b')).toEqual({
			contextWindowTokens: 262_144,
			source: 'user-reported: 262K context window',
		});
	});
});
