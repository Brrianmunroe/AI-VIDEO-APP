/**
 * AI Video Editing API Server
 *
 * Holds API keys; proxies requests to OpenAI and Deepgram.
 * Validates Supabase JWT before proxying.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env from server directory (works even when run from project root)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-video-editing-api' });
});

// Protected routes (require valid Supabase JWT)
// Proxy endpoints will be added here: /generate-selects, /transcribe

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Generate selects: proxy to OpenAI (app sends prompt + payload, we add our key)
app.post('/api/generate-selects', authMiddleware, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });
  }

  const { modelId, systemPrompt, userContent, responseFormat } = req.body;
  if (!systemPrompt || !userContent) {
    return res.status(400).json({ error: 'Missing systemPrompt or userContent' });
  }

  const model = modelId || process.env.OPENAI_MODEL_ID || 'gpt-4o-mini';
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent) },
    ],
    temperature: 0.3,
    max_tokens: 8192,
  };
  if (responseFormat != null && typeof responseFormat === 'object') {
    body.response_format = responseFormat;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      return res.status(502).json({ error: errMsg });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (text == null) {
      return res.status(502).json({ error: 'No response content from OpenAI' });
    }

    res.json({ content: text });
  } catch (err) {
    console.error('[generate-selects]', err);
    res.status(502).json({ error: err?.message || 'Proxy request failed' });
  }
});

app.post('/api/transcribe', authMiddleware, (_req, res) => {
  res.status(501).json({
    error: 'Not implemented yet',
    message: 'Proxy to Deepgram will be added in a follow-up.',
  });
});

const server = app.listen(PORT, () => {
  console.log(`[Server] API running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server] Port ${PORT} is already in use.`);
    console.error('Stop the other process using: lsof -ti:' + PORT + ' | xargs kill -9');
    console.error('Or use a different port: PORT=3002 npm run dev\n');
    process.exit(1);
  }
  throw err;
});
