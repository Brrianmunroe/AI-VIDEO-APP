/**
 * Transcription Service
 * Runs local Whisper (via whisper-node) on project media and stores transcripts in the DB.
 * Requires: FFmpeg (for 16kHz WAV extraction), whisper-node and a downloaded model.
 *
 * We check for whisper binary and model BEFORE importing whisper-node, because
 * loading that package runs top-level code that calls process.exit(1) if the
 * whisper.cpp binary isn't built, which would crash the whole Electron app.
 */

import { getDatabase } from '../db/index.js';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getMediaByProject, extractAudioTo16kWav } from './mediaService.js';

const execFileAsync = promisify(execFile);
const DEFAULT_WHISPER_MODEL = 'ggml-base.en.bin';
const WORD_SCRIPT_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Get Whisper paths. Returns { ok: true, whisperCppDir, mainBinary, modelPath } or { ok: false, message }.
 */
function getWhisperPaths() {
  const appPath = app.getAppPath();
  const whisperCppDir = join(appPath, 'node_modules', 'whisper-node', 'lib', 'whisper.cpp');
  const mainBinary = platform() === 'win32' ? join(whisperCppDir, 'main.exe') : join(whisperCppDir, 'main');
  const modelPath = join(whisperCppDir, 'models', DEFAULT_WHISPER_MODEL);

  if (!existsSync(whisperCppDir)) {
    return { ok: false, message: 'Whisper is not installed. Run: npm install whisper-node' };
  }
  if (!existsSync(mainBinary)) {
    return {
      ok: false,
      message: 'Whisper binary not built. From the project folder run: cd node_modules/whisper-node/lib/whisper.cpp && make',
    };
  }
  if (!existsSync(modelPath)) {
    return {
      ok: false,
      message: "Whisper model not downloaded. Run: npx whisper-node download",
    };
  }
  return { ok: true, whisperCppDir, mainBinary, modelPath };
}

/**
 * Check if Whisper is set up (binary + default model) without importing whisper-node.
 * Returns { ok: true } or { ok: false, message: string }.
 */
function checkWhisperReady() {
  const result = getWhisperPaths();
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** Parse SRT timestamp "00:00:14,310" or "00:00:14.310" to seconds */
function parseSrtTimestamp(str) {
  if (typeof str !== 'string') return 0;
  const parts = str.trim().split(':');
  if (parts.length < 3) return 0;
  const h = parseFloat(parts[0], 10) || 0;
  const m = parseFloat(parts[1], 10) || 0;
  const s = parseFloat(parts[2].replace(',', '.'), 10) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Parse SRT file content into segments { start, end, text }.
 * SRT format: optional BOM, then blocks of "index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext\n\n"
 */
function parseSrtContent(content) {
  if (!content || typeof content !== 'string') return [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/).filter((b) => b.trim());
  const segments = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeLine = lines[1];
    const match = timeLine.match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})$/);
    if (!match) continue;
    const start = parseSrtTimestamp(match[1]);
    const end = parseSrtTimestamp(match[2]);
    const text = lines.slice(2).join(' ').trim();
    if (text.length > 0) {
      segments.push({ start, end, text });
    }
  }
  return segments;
}

/**
 * Resolve path to Python executable and transcribe_words script (bundled when packaged, system when not).
 */
function getWordLevelScriptPaths() {
  const plat = platform();
  if (app.isPackaged && process.resourcesPath) {
    const resourcesPath = process.resourcesPath;
    const pythonDir = join(resourcesPath, 'python');
    const scriptPath = join(resourcesPath, 'transcribe_words.py');
    const pythonPath =
      plat === 'win32'
        ? join(pythonDir, 'python.exe')
        : join(pythonDir, 'bin', 'python3');
    return { pythonPath, scriptPath };
  }
  const appPath = app.getAppPath();
  const scriptPath = join(appPath, 'scripts', 'transcribe_words.py');
  const pythonPath = plat === 'win32' ? 'python' : 'python3';
  return { pythonPath, scriptPath };
}

/**
 * Run the Python word-level transcription script (faster-whisper).
 * Returns array of { word, start, end } or null on failure.
 */
async function runWordLevelScript(wavPath) {
  const { pythonPath, scriptPath } = getWordLevelScriptPaths();
  if (!existsSync(scriptPath)) return null;
  if (app.isPackaged && !existsSync(pythonPath)) return null;
  try {
    const { stdout } = await execFileAsync(pythonPath, [scriptPath, wavPath], {
      encoding: 'utf8',
      timeout: WORD_SCRIPT_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout || '{}');
    const words = Array.isArray(parsed?.words) ? parsed.words : [];
    const valid = words.filter(
      (w) =>
        w != null &&
        typeof w.word === 'string' &&
        Number.isFinite(Number(w.start)) &&
        Number.isFinite(Number(w.end))
    );
    if (valid.length === 0) return null;
    return valid.map((w) => ({
      word: w.word,
      start: Number(w.start),
      end: Number(w.end),
    }));
  } catch (err) {
    console.warn('[transcription] Word-level script failed:', err?.message);
    return null;
  }
}

/**
 * Run whisper.cpp main binary with SRT output and parse the result.
 * The main binary only supports -osrt (not -oj/-of); it writes to <wavPath>.srt.
 * Returns array of { start (seconds), end (seconds), text } or null on failure.
 */
async function runWhisperAndParseSrt(wavPath, whisperCppDir, mainBinary) {
  const modelArg = `models/${DEFAULT_WHISPER_MODEL}`;
  const args = [
    '-m', modelArg,
    '-f', wavPath,
    '-l', 'auto',
    '-osrt',
  ];
  console.log('[transcription] Running Whisper:', mainBinary, 'cwd:', whisperCppDir, 'args:', args.join(' '));
  try {
    await execFileAsync(mainBinary, args, {
      cwd: whisperCppDir,
      timeout: 600000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    console.warn('[transcription] Whisper binary failed:', err?.message, err?.code);
    return null;
  }
  const srtPath = `${wavPath}.srt`;
  if (!existsSync(srtPath)) {
    console.warn('[transcription] Whisper did not produce SRT:', srtPath);
    return null;
  }
  console.log('[transcription] SRT produced, parsing:', srtPath);
  try {
    const raw = readFileSync(srtPath, 'utf8');
    const segments = parseSrtContent(raw);
    return segments;
  } catch (err) {
    console.warn('[transcription] Failed to parse Whisper SRT:', err?.message);
    return null;
  } finally {
    try {
      if (existsSync(srtPath)) unlinkSync(srtPath);
    } catch (_) {}
  }
}

/** Directory for temporary 16kHz WAV files under userData */
function getTranscriptionAudioDir() {
  const dir = join(app.getPath('userData'), 'transcription_audio');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get transcript for a media id, if any.
 * Returns { id, mediaId, text, words, emptyReason, createdAt } or null.
 */
export function getTranscriptByMediaId(mediaId) {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT id, media_id, text, words, empty_reason, created_at FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  if (!row) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    words: JSON.parse(row.words || '[]'),
    emptyReason: row.empty_reason ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Get all transcripts for a project (one per media that has a transcript).
 * Returns array of { id, mediaId, text, words, createdAt }.
 */
export function getTranscriptsByProject(projectId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT t.id, t.media_id, t.text, t.words, t.created_at
    FROM transcripts t
    INNER JOIN media m ON m.id = t.media_id
    WHERE m.project_id = ?
    ORDER BY m.created_at ASC, t.id ASC
  `).all(projectId);
  return rows.map((row) => ({
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    words: JSON.parse(row.words || '[]'),
    createdAt: row.created_at,
  }));
}

/**
 * Insert an empty transcript for a media item (e.g. no audio or no speech detected).
 * @param {object} db - Database instance
 * @param {number} mediaId
 * @param {string} [reason] - 'no_audio' | 'transcription_failed'; why the transcript is empty
 * @returns {{ id: number, mediaId: number, text: string, words: Array, emptyReason: string|null }}
 */
function insertEmptyTranscript(db, mediaId, reason = null) {
  const insertStmt = db.prepare(
    'INSERT INTO transcripts (media_id, text, words, empty_reason) VALUES (?, ?, ?, ?)'
  );
  insertStmt.run(mediaId, '', JSON.stringify([]), reason);
  const row = db.prepare(
    'SELECT id, media_id, text, words, empty_reason FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  return {
    id: row.id,
    mediaId: row.media_id,
    text: '',
    words: [],
    emptyReason: row.empty_reason ?? null,
  };
}

/**
 * Transcribe one media item and save to DB.
 * Uses whisper-node; expects 16kHz WAV (we extract via FFmpeg).
 * When there is no audio or no speech, saves an empty transcript so the clip still appears with "No transcript available."
 * @param {number} mediaId
 * @returns {Promise<{ id: number, mediaId: number, text: string, words: Array }>}
 * @throws if media not found or Whisper/FFmpeg setup is missing (not for no-audio)
 */
export async function runForMedia(mediaId) {
  const db = getDatabase();
  const media = db.prepare('SELECT id, file_path FROM media WHERE id = ?').get(mediaId);
  if (!media) {
    throw new Error('Media not found');
  }

  const existing = getTranscriptByMediaId(mediaId);
  if (existing) {
    return existing;
  }

  const paths = getWhisperPaths();
  if (!paths.ok) {
    throw new Error(paths.message);
  }

  const audioDir = getTranscriptionAudioDir();
  const wavPath = join(audioDir, `media_${mediaId}.wav`);

  console.log('[transcription] Extracting audio for media', mediaId, 'to', wavPath);
  const extracted = await extractAudioTo16kWav(media.file_path, wavPath);
  if (!extracted) {
    console.warn('[transcription] No audio or could not extract for media', mediaId, '- saving empty transcript.');
    const empty = insertEmptyTranscript(db, mediaId, 'no_audio');
    return empty;
  }

  let words = null;
  try {
    words = await runWordLevelScript(wavPath);
  } catch (_) {}

  if (words == null || words.length === 0) {
    let segments;
    try {
      segments = await runWhisperAndParseSrt(
        wavPath,
        paths.whisperCppDir,
        paths.mainBinary
      );
    } finally {
      try {
        if (existsSync(wavPath)) unlinkSync(wavPath);
      } catch (_) {}
    }

    if (segments === null || segments.length === 0) {
      if (segments === null) {
        console.warn('[transcription] Whisper returned no transcript for media', mediaId, '- saving empty transcript.');
      }
      return insertEmptyTranscript(db, mediaId, 'transcription_failed');
    }

    words = segments.map((seg) => ({
      word: seg.text,
      start: seg.start,
      end: seg.end,
    }));
  } else {
    try {
      if (existsSync(wavPath)) unlinkSync(wavPath);
    } catch (_) {}
  }

  const text = words.map((w) => w.word).join(' ');

  const insertStmt = db.prepare(
    'INSERT INTO transcripts (media_id, text, words) VALUES (?, ?, ?)'
  );
  insertStmt.run(mediaId, text, JSON.stringify(words));

  const row = db.prepare(
    'SELECT id, media_id, text, words, empty_reason FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  return {
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    words: JSON.parse(row.words || '[]'),
    emptyReason: row.empty_reason ?? null,
  };
}

/**
 * Transcribe all media in a project that don't have a transcript yet.
 * Runs sequentially to avoid overloading CPU.
 * @param {number} projectId
 * @returns {Promise<{ transcribed: number, skipped: number, errors: Array<{ mediaId: number, message: string }> }>}
 */
export async function runForProject(projectId) {
  console.log('[transcription] runForProject started, projectId:', projectId);
  const mediaList = getMediaByProject(projectId);
  console.log('[transcription] Media count:', mediaList.length);
  const transcribed = [];
  const errors = [];

  for (const media of mediaList) {
    const hasTranscript = getTranscriptByMediaId(media.id) !== null;
    if (hasTranscript) {
      console.log('[transcription] Skipping media', media.id, '(already has transcript)');
      continue;
    }
    try {
      console.log('[transcription] Transcribing media', media.id);
      const result = await runForMedia(media.id);
      transcribed.push(result);
      const wordCount = result?.words?.length ?? 0;
      console.log('[transcription] Done media', media.id, 'segments:', wordCount);
    } catch (err) {
      const message = err?.message || String(err);
      errors.push({ mediaId: media.id, message });
      console.error('[transcription] Failed for media', media.id, message);
    }
  }

  console.log('[transcription] runForProject finished. transcribed:', transcribed.length, 'errors:', errors.length);
  return {
    transcribed: transcribed.length,
    skipped: mediaList.length - transcribed.length - errors.length,
    errors,
  };
}
