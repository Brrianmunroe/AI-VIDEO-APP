/**
 * LLM Client
 * Provider-agnostic wrapper for calling chat completions APIs.
 * Currently supports OpenAI only; designed for easy extension to Anthropic/local.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Load .env.local from project root. Tries cwd first (when running `electron .`), then dirname-based path. */
function loadEnvLocal() {
  const candidates = [
    join(process.cwd(), '.env.local'),
    join(__dirname, '..', '..', '.env.local'),
    app?.isPackaged ? join(process.resourcesPath, '.env.local') : null,
  ].filter(Boolean);

  for (const path of candidates) {
    if (!path || !existsSync(path)) continue;
    try {
      let raw = readFileSync(path, 'utf8');
      // Strip BOM so the first key is OPENAI_API_KEY, not \uFEFFOPENAI_API_KEY
      if (raw.length > 0 && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (key) {
          process.env[key] = value;
        }
      }
      return;
    } catch (err) {
      console.warn('[llmClient] Could not parse .env.local at', path, err?.message);
    }
  }
}

loadEnvLocal();
if (!process.env.OPENAI_API_KEY?.trim()) {
  console.warn('[llmClient] OPENAI_API_KEY not set after loading .env.local (check file path and BOM)');
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Call the LLM with a system prompt and user payload.
 * @param {{ provider?: string, modelId?: string, systemPrompt: string, userPayload: string|object, responseFormat?: object }} options
 *   responseFormat: optional OpenAI response_format (e.g. { type: 'json_schema', json_schema: { name, strict, schema } }) for structured output
 * @returns {Promise<string>} Raw response text from the model
 */
export async function callLLM({ provider = 'openai', modelId, systemPrompt, userPayload, responseFormat }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = modelId || process.env.OPENAI_MODEL_ID || 'gpt-4o-mini';

  if (!apiKey || !apiKey.trim()) {
    throw new Error('OpenAI API key not set. Add OPENAI_API_KEY to .env.local');
  }

  if (provider !== 'openai') {
    throw new Error(`Provider "${provider}" not yet supported`);
  }

  const userContent = typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload, null, 0);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 8192,
  };
  if (responseFormat != null && typeof responseFormat === 'object') {
    body.response_format = responseFormat;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg = `OpenAI API error ${response.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.error?.message) errMsg = parsed.error.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (text == null) {
    throw new Error('No response content from OpenAI');
  }
  return text;
}

/**
 * Call the LLM via our backend proxy (keys stay on server).
 * @param {{ baseUrl: string, token: string, modelId?: string, systemPrompt: string, userPayload: string|object, responseFormat?: object }} options
 * @returns {Promise<string>} Raw response text
 */
export async function callLLMViaBackend({ baseUrl, token, modelId, systemPrompt, userPayload, responseFormat }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/generate-selects`;
  const userContent = typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload, null, 0);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId,
        systemPrompt,
        userContent,
        responseFormat,
      }),
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('network') || msg.includes('Failed')) {
      throw new Error('Cannot connect to the server. Make sure it\'s running (npm run server) or check your connection.');
    }
    throw new Error(msg);
  }

  const errBody = await response.text();
  if (!response.ok) {
    let errMsg;
    try {
      const parsed = JSON.parse(errBody);
      errMsg = parsed?.error || response.statusText;
    } catch (_) {
      errMsg = errBody || `Server error (${response.status})`;
    }
    if (response.status === 401) {
      if (errMsg?.toLowerCase?.().includes('invalid')) {
        throw new Error('Invalid token. The JWT secret in Railway may not match Supabase. In Supabase: Project Settings → API → JWT Settings → copy the JWT Secret (not the anon key). Paste it as SUPABASE_JWT_SECRET in Railway Variables.');
      }
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(errMsg);
  }

  let data;
  try {
    data = JSON.parse(errBody);
  } catch (_) {
    throw new Error('Invalid response from server');
  }
  const text = data?.content;
  if (text == null) {
    throw new Error('No response from server. Try again.');
  }
  return text;
}
