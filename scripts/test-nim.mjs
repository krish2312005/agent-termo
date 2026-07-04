// =============================================================================
// NIM API Quick Test — validates that NIM_API_KEY can make a completion call
// =============================================================================
// Usage: node scripts/test-nim.mjs

import { readFileSync } from 'node:fs';

// Load .env manually
try {
  const envContent = readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch {
  // ignore
}

const apiKey = process.env.NIM_API_KEY ?? '';
const baseUrl = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
// DOT notation REQUIRED. Underscore format returns HTTP 404.
const model = process.env.NIM_MODEL ?? 'meta/llama-3.1-8b-instruct';
// Supported: meta/llama-3.1-8b-instruct, meta/llama-3.1-70b-instruct.

console.log('=== Agent-Termo NIM API Test ===');
console.log('API Key:', apiKey ? `${apiKey.slice(0, 10)}... (${apiKey.length} chars)` : 'MISSING — set NIM_API_KEY in .env');
console.log('Base URL:', baseUrl);
console.log('Model:', model);
console.log();

if (!apiKey || apiKey.includes('your_nvidia_nim_api_key_here') || apiKey === '') {
  console.error('ERROR: No valid NIM_API_KEY found in .env or environment.');
  process.exit(1);
}

const testMessage = 'Please respond with exactly the words "API works" and nothing else.';
const messages = [{ role: 'user', content: testMessage }];

console.log('Sending test message to NIM API...');
console.log('Message:', testMessage);
console.log();

async function run() {
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'agent-termo/1.0',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 50,
        temperature: 0.1,
        stream: false,
      }),
    });
  } catch (err) {
    console.error('NETWORK ERROR: Could not reach NIM API:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log('HTTP Status:', response.status, response.statusText);
  console.log();

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '(could not read body)';
    }
    console.error('API ERROR (HTTP', response.status, '):', errorBody);

    if (response.status === 401 || response.status === 403) {
      console.error('\nDIAGNOSIS: Authentication failure. Check your NIM_API_KEY is valid and not expired.\n');
      console.error('TIP: If the model name looks like "nvidia_nim/..." try a standard Meta model:');
      console.error('   NIM_MODEL=meta/llama-3.1-8b-instruct');
    } else if (response.status === 404) {
      console.error('\nDIAGNOSIS: Model not found in your API key catalog (HTTP 404).');
      console.error('\nThe model "' + model + '" may not be available for your key.');
      console.error('\nTry one of these models (check https://build.nvidia.com/ for your key):');
      console.error('   NIM_MODEL=meta/llama-3.1-8b-instruct   # fast');
      console.error('   NIM_MODEL=meta/llama-3.1-70b-instruct  # higher quality');
    } else if (response.status === 429) {
      console.error('\nDIAGNOSIS: Rate limit hit. Wait and try again.');
    } else if (response.status >= 500) {
      console.error('\nDIAGNOSIS: NIM API server error. Try again later.');
    }
    process.exit(1);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.text();
    console.error('PARSE ERROR: Could not parse JSON response:', text.slice(0, 200));
    process.exit(1);
  }

  const content = data.choices?.[0]?.message?.content ?? '(no content in response)';
  console.log('Response:', content);
  console.log();

  const usage = data.usage;
  if (usage) {
    console.log('Token usage — prompt:', usage.prompt_tokens, '| completion:', usage.completion_tokens, '| total:', usage.total_tokens);
  }

  const success = content.toLowerCase().includes('api works');
  if (success) {
    console.log('\nRESULT: NIM API is working correctly.');
    process.exit(0);
  } else {
    console.warn('WARNING: Response did not contain expected "API works" text.');
    console.warn('The connection and authentication are working — the model just answered differently.');
    process.exit(0);
  }
}

run();