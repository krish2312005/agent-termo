import { describe, expect, it } from 'vitest';
import {
	MalformedModelOutputError,
	MALFORMED_MODEL_OUTPUT_MESSAGE,
	NimClient,
	isDegenerateModelOutput,
} from '../../src/llm/client.js';
import { getProviderModelLimits } from '../../src/llm/models.js';
import type { ConversationMessage } from '../../src/types/index.js';
import { isTransientError } from '../../src/main.js';

const NEMOTRON_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

/** Build the user-reported runaway payload: one argument line followed by repeating markers. */
function userSampleRunaway(closeLines: number): string {
	const sample = '<|open|>argument key="path" type="string"<|sep|>src/llm/models.ts<|close|>argument<|sep|>';
	return [sample, ...Array.from({ length: closeLines }, () => '<|close|>message<|sep|>')].join('\n');
}

/** Construct a real NimClient offline, then swap its OpenAI transport for a fake. */
function offlineClient(transport: unknown): NimClient {
	const previous = {
		provider: process.env.AGENT_TERMO_PROVIDER,
		model: process.env.AGENT_TERMO_MODEL,
		apiKey: process.env.AGENT_TERMO_API_KEY,
	};
	process.env.AGENT_TERMO_PROVIDER = 'nvidia';
	process.env.AGENT_TERMO_MODEL = NEMOTRON_MODEL;
	process.env.AGENT_TERMO_API_KEY = 'test-key';
	try {
		const client = new NimClient();
		(client as unknown as { client: unknown }).client = transport;
		return client;
	} finally {
		for (const [key, value] of [
			['AGENT_TERMO_PROVIDER', previous.provider],
			['AGENT_TERMO_MODEL', previous.model],
			['AGENT_TERMO_API_KEY', previous.apiKey],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

const messages: ConversationMessage[] = [
	{ id: 'user-1', role: 'user', content: 'Read src/llm/models.ts', timestamp: new Date() },
];

describe('isDegenerateModelOutput', () => {
	it('ignores normal prose', () => {
		expect(isDegenerateModelOutput('Here is the fix you asked for.')).toBe(false);
		expect(isDegenerateModelOutput('')).toBe(false);
	});

	it('ignores legitimate tool-call markup', () => {
		const markup = '<tool_call><function=file_read><parameter name="path">src/main.ts</parameter></function></tool_call>';
		expect(isDegenerateModelOutput(markup)).toBe(false);
		const colonMarkup = '<tool_call><function=file:read><parameter name="path">src/main.ts</parameter></function></tool_call>';
		expect(isDegenerateModelOutput(colonMarkup)).toBe(false);
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

	it('detects the user-reported sample once its close/message line repeats 6 times', () => {
		expect(isDegenerateModelOutput(userSampleRunaway(5))).toBe(false);
		expect(isDegenerateModelOutput(userSampleRunaway(6))).toBe(true);
	});
});

describe('streaming guard', () => {
	it('aborts a live stream and throws instead of yielding degenerate content', async () => {
		const runaway = userSampleRunaway(6);
		const chunks = [runaway.slice(0, 30), runaway.slice(30, 90), runaway.slice(90)];
		const client = offlineClient({
			chat: {
				completions: {
					create: async () => (async function* () {
						for (const content of chunks) yield { choices: [{ delta: { content } }] };
					})(),
				},
			},
		});

		const yielded: unknown[] = [];
		let thrown: unknown;
		try {
			for await (const chunk of client.streamComplete(messages)) yielded.push(chunk);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(MalformedModelOutputError);
		expect((thrown as MalformedModelOutputError).retryable).toBe(false);
		expect(yielded).toEqual([]);
	});

	it('rejects degenerate non-streamed content before returning it', async () => {
		const client = offlineClient({
			chat: {
				completions: {
					create: async () => ({ choices: [{ message: { content: userSampleRunaway(6) } }] }),
				},
			},
		});

		await expect(client.complete(messages)).rejects.toBeInstanceOf(MalformedModelOutputError);
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
