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

/** Parse timestamp string "00:00:14.310" or "00:00:14,310" to seconds */
function parseTimestamp(str) {
  if (typeof str !== 'string') return 0;
  const parts = str.trim().split(':');
  if (parts.length < 3) return 0;
  const h = parseFloat(parts[0], 10) || 0;
  const m = parseFloat(parts[1], 10) || 0;
  const s = parseFloat(parts[2].replace(',', '.'), 10) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Run whisper.cpp main binary with JSON output and parse transcription.
 * Returns array of { start (seconds), end (seconds), text } or null on failure.
 */
async function runWhisperAndParseJson(wavPath, outputBasePath, whisperCppDir, mainBinary) {
  const modelArg = `models/${DEFAULT_WHISPER_MODEL}`;
  const args = [
    '-m', modelArg,
    '-f', wavPath,
    '-l', 'auto',
    '-oj',
    '-of', outputBasePath,
  ];
  try {
    await execFileAsync(mainBinary, args, {
      cwd: whisperCppDir,
      timeout: 600000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    console.warn('[transcription] Whisper binary failed:', err?.message);
    return null;
  }
  const jsonPath = `${outputBasePath}.json`;
  if (!existsSync(jsonPath)) {
    console.warn('[transcription] Whisper did not produce JSON:', jsonPath);
    return null;
  }
  let data;
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    console.warn('[transcription] Failed to parse Whisper JSON:', err?.message);
    return null;
  }
  try {
    if (!data.transcription || !Array.isArray(data.transcription)) {
      return [];
    }
    return data.transcription.map((seg) => {
      const ts = seg.timestamps || {};
      const from = parseTimestamp(ts.from);
      const to = parseTimestamp(ts.to);
      const text = typeof seg.text === 'string' ? seg.text.trim() : '';
      return { start: from, end: to, text };
    }).filter((seg) => seg.text.length > 0);
  } finally {
    try {
      if (existsSync(jsonPath)) unlinkSync(jsonPath);
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
 * Returns { id, mediaId, text, words } or null.
 */
export function getTranscriptByMediaId(mediaId) {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT id, media_id, text, words, created_at FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  if (!row) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    words: JSON.parse(row.words || '[]'),
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
 * @returns {{ id: number, mediaId: number, text: string, words: Array }}
 */
function insertEmptyTranscript(db, mediaId) {
  const insertStmt = db.prepare(
    'INSERT INTO transcripts (media_id, text, words) VALUES (?, ?, ?)'
  );
  insertStmt.run(mediaId, '', JSON.stringify([]));
  const row = db.prepare(
    'SELECT id, media_id, text, words FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  return {
    id: row.id,
    mediaId: row.media_id,
    text: '',
    words: [],
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
  const outputBasePath = join(audioDir, `media_${mediaId}_out`);

  const extracted = await extractAudioTo16kWav(media.file_path, wavPath);
  if (!extracted) {
    console.warn('[transcription] No audio or could not extract for media', mediaId, '- saving empty transcript.');
    const empty = insertEmptyTranscript(db, mediaId);
    return empty;
  }

  let segments;
  try {
    segments = await runWhisperAndParseJson(
      wavPath,
      outputBasePath,
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
    return insertEmptyTranscript(db, mediaId);
  }

  const words = segments.map((seg) => ({
    word: seg.text,
    start: seg.start,
    end: seg.end,
  }));
  const text = words.map((w) => w.word).join(' ');

  const insertStmt = db.prepare(
    'INSERT INTO transcripts (media_id, text, words) VALUES (?, ?, ?)'
  );
  insertStmt.run(mediaId, text, JSON.stringify(words));

  const row = db.prepare(
    'SELECT id, media_id, text, words FROM transcripts WHERE media_id = ?'
  ).get(mediaId);
  return {
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    words: JSON.parse(row.words || '[]'),
  };
}

/**
 * Transcribe all media in a project that don't have a transcript yet.
 * Runs sequentially to avoid overloading CPU.
 * @param {number} projectId
 * @returns {Promise<{ transcribed: number, skipped: number, errors: Array<{ mediaId: number, message: string }> }>}
 */
export async function runForProject(projectId) {
  const mediaList = getMediaByProject(projectId);
  const transcribed = [];
  const errors = [];

  for (const media of mediaList) {
    const hasTranscript = getTranscriptByMediaId(media.id) !== null;
    if (hasTranscript) {
      continue;
    }
    try {
      const result = await runForMedia(media.id);
      transcribed.push(result);
    } catch (err) {
      const message = err?.message || String(err);
      errors.push({ mediaId: media.id, message });
      console.error('[transcription] Failed for media', media.id, message);
    }
  }

  return {
    transcribed: transcribed.length,
    skipped: mediaList.length - transcribed.length - errors.length,
    errors,
  };
}
