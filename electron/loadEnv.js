/**
 * Load .env.local as early as possible so DEEPGRAM_API_KEY, OPENAI_API_KEY, etc.
 * are available before transcription or AI services run.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prefer app.getAppPath() (reliable in Electron) over process.cwd() (can differ when launched from npm/IDE)
const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : process.cwd();
const candidates = [
  join(appPath, '.env.local'),
  join(__dirname, '..', '.env.local'),
  join(process.cwd(), '.env.local'),
  app?.isPackaged ? join(process.resourcesPath, '.env.local') : null,
].filter(Boolean);

let loadedFrom = null;
const keysLoaded = [];
for (const path of candidates) {
  if (!path || !existsSync(path)) continue;
  try {
    let raw = readFileSync(path, 'utf8');
    if (raw.length > 0 && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (/^["']/.test(value) && value.endsWith(value[0])) value = value.slice(1, -1);
      if (key) {
        process.env[key] = value;
        keysLoaded.push(key);
      }
    }
    loadedFrom = path;
    break;
  } catch (err) {
    console.warn('[loadEnv] Could not parse .env.local at', path, err?.message);
  }
}
if (loadedFrom) {
  console.log('[loadEnv] Loaded .env.local from', loadedFrom);
  console.log('[loadEnv] Keys loaded:', keysLoaded.join(', ') || '(none)');
  const dg = process.env.DEEPGRAM_API_KEY?.trim();
  const dgKey = keysLoaded.find((k) => k.includes('DEEPGRAM'));
  console.log('[loadEnv] DEEPGRAM_API_KEY set:', !!dg, dg ? `(${dg.length} chars)` : '(empty/missing)', dgKey ? `[key found as "${dgKey}"]` : '[no DEEPGRAM key in file]');
} else {
  console.warn('[loadEnv] No .env.local found. Checked:', candidates);
  console.warn('[loadEnv] app.getAppPath():', appPath, 'cwd:', process.cwd());
  console.warn('[loadEnv] DEEPGRAM_API_KEY set:', !!process.env.DEEPGRAM_API_KEY?.trim());
}
