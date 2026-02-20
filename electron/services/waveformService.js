/**
 * Waveform Service
 * Extracts audio via FFmpeg to a temp WAV, computes multi-resolution min/max peak pyramid,
 * and serves windowed waveform data for viewport rendering.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { app } from 'electron';
import { getFilePathForPlayback, getFfmpegCandidates, getFfmpegEnv } from './mediaService.js';

const execFileAsync = promisify(execFile);

const WAV_HEADER_SIZE = 44;
const SAMPLE_RATE = 16000;
/** Base level resolution: one min/max pair per this many PCM samples. */
const BASE_BUCKET_SAMPLES = 64;
const CACHE_SCHEMA_VERSION = 2;

/** In-memory pyramid cache keyed by mediaId. */
const pyramidCache = new Map();

function getWaveformDir() {
  const dir = join(app.getPath('userData'), 'waveform_cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getTempDir() {
  const dir = join(app.getPath('userData'), 'waveform_audio');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getCachePath(mediaId) {
  return join(getWaveformDir(), `waveform_v${CACHE_SCHEMA_VERSION}_${mediaId}.json`);
}

async function extractWav(sourcePath, wavPath, timeoutMs = 120000) {
  const outDir = join(wavPath, '..');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const args = ['-y', '-i', sourcePath, '-vn', '-acodec', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-ac', '1', wavPath];
  const opts = { timeout: timeoutMs, env: getFfmpegEnv() };
  for (const ffmpegPath of getFfmpegCandidates()) {
    try {
      await execFileAsync(ffmpegPath, args, opts);
      if (existsSync(wavPath)) return true;
    } catch (err) {
      if (ffmpegPath === 'ffmpeg' && err?.code === 'ENOENT') {
        console.warn('[waveform] ffmpeg not in PATH; trying known install locations.');
      }
      continue;
    }
  }
  return false;
}

/**
 * Build multi-resolution min/max pyramid from raw PCM buffer.
 * Level 0 = finest (one min/max pair per BASE_BUCKET_SAMPLES PCM samples).
 * Each subsequent level halves the count by merging pairs.
 */
function buildPyramid(buffer) {
  if (buffer.length <= WAV_HEADER_SIZE) return { levels: [], durationSec: 0, sampleRate: SAMPLE_RATE };
  const numSamples = Math.floor((buffer.length - WAV_HEADER_SIZE) / 2);
  if (numSamples <= 0) return { levels: [], durationSec: 0, sampleRate: SAMPLE_RATE };

  const durationSec = numSamples / SAMPLE_RATE;
  const numBuckets = Math.max(1, Math.ceil(numSamples / BASE_BUCKET_SAMPLES));

  const mins0 = new Float32Array(numBuckets);
  const maxs0 = new Float32Array(numBuckets);

  for (let i = 0; i < numBuckets; i++) {
    const sampleStart = i * BASE_BUCKET_SAMPLES;
    const sampleEnd = Math.min((i + 1) * BASE_BUCKET_SAMPLES, numSamples);
    let lo = 1;
    let hi = -1;
    for (let s = sampleStart; s < sampleEnd; s++) {
      const byteOffset = WAV_HEADER_SIZE + s * 2;
      if (byteOffset + 1 >= buffer.length) break;
      const val = buffer.readInt16LE(byteOffset) / 32768;
      if (val < lo) lo = val;
      if (val > hi) hi = val;
    }
    if (lo > hi) { lo = 0; hi = 0; }
    mins0[i] = lo;
    maxs0[i] = hi;
  }

  const levels = [{ mins: mins0, maxs: maxs0, count: numBuckets }];

  let prevMins = mins0;
  let prevMaxs = maxs0;
  let prevCount = numBuckets;

  while (prevCount > 2) {
    const nextCount = Math.ceil(prevCount / 2);
    const nextMins = new Float32Array(nextCount);
    const nextMaxs = new Float32Array(nextCount);
    for (let i = 0; i < nextCount; i++) {
      const a = i * 2;
      const b = Math.min(a + 1, prevCount - 1);
      nextMins[i] = Math.min(prevMins[a], prevMins[b]);
      nextMaxs[i] = Math.max(prevMaxs[a], prevMaxs[b]);
    }
    levels.push({ mins: nextMins, maxs: nextMaxs, count: nextCount });
    prevMins = nextMins;
    prevMaxs = nextMaxs;
    prevCount = nextCount;
  }

  return { levels, durationSec, sampleRate: SAMPLE_RATE };
}

function serializePyramid(pyramid) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    sampleRate: pyramid.sampleRate,
    durationSec: pyramid.durationSec,
    levels: pyramid.levels.map((l) => ({
      count: l.count,
      mins: Array.from(l.mins),
      maxs: Array.from(l.maxs),
    })),
  };
}

function deserializePyramid(obj) {
  if (!obj || obj.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
  return {
    sampleRate: obj.sampleRate,
    durationSec: obj.durationSec,
    levels: obj.levels.map((l) => ({
      count: l.count,
      mins: new Float32Array(l.mins),
      maxs: new Float32Array(l.maxs),
    })),
  };
}

async function ensurePyramid(mediaId) {
  const id = typeof mediaId === 'string' ? parseInt(mediaId, 10) : mediaId;
  if (!Number.isFinite(id)) throw new Error('Invalid media id');

  if (pyramidCache.has(id)) return pyramidCache.get(id);

  const cachePath = getCachePath(id);
  if (existsSync(cachePath)) {
    try {
      const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
      const p = deserializePyramid(raw);
      if (p && p.levels.length > 0) {
        pyramidCache.set(id, p);
        return p;
      }
    } catch { /* stale or corrupt cache, rebuild */ }
  }

  const filePath = getFilePathForPlayback(id);
  if (!filePath) throw new Error('Media file not found');

  const wavPath = join(getTempDir(), `waveform_${id}.wav`);
  const extracted = await extractWav(filePath, wavPath);
  if (!extracted) throw new Error('Could not extract audio for waveform (install ffmpeg)');

  let pyramid;
  try {
    const buffer = readFileSync(wavPath);
    pyramid = buildPyramid(buffer);
  } finally {
    try { if (existsSync(wavPath)) unlinkSync(wavPath); } catch {}
  }

  if (pyramid.levels.length > 0) {
    try { writeFileSync(cachePath, JSON.stringify(serializePyramid(pyramid))); } catch {}
  }

  pyramidCache.set(id, pyramid);
  return pyramid;
}

/**
 * Get windowed min/max waveform data for viewport rendering.
 * @param {number|string} mediaId
 * @param {number} startSec - visible window start in seconds
 * @param {number} endSec - visible window end in seconds
 * @param {number} pixelWidth - viewport pixel width to fill
 * @returns {{ mins: number[], maxs: number[], durationSec: number, startSec: number, endSec: number }}
 */
export async function getWindow(mediaId, startSec, endSec, pixelWidth) {
  const pyramid = await ensurePyramid(mediaId);
  if (!pyramid || pyramid.levels.length === 0 || pyramid.durationSec <= 0) {
    return { mins: [], maxs: [], durationSec: 0, startSec: 0, endSec: 0 };
  }

  const dur = pyramid.durationSec;
  const s = Math.max(0, Math.min(dur, startSec));
  const e = Math.max(s, Math.min(dur, endSec));
  const windowDur = e - s;
  if (windowDur <= 0 || pixelWidth <= 0) {
    return { mins: [], maxs: [], durationSec: dur, startSec: s, endSec: e };
  }

  const secsPerPixel = windowDur / pixelWidth;
  const samplesPerPixel = secsPerPixel * pyramid.sampleRate;
  const desiredBucketsPerPixel = samplesPerPixel / BASE_BUCKET_SAMPLES;

  let bestLevel = 0;
  for (let i = 0; i < pyramid.levels.length; i++) {
    const levelScale = Math.pow(2, i);
    if (levelScale <= desiredBucketsPerPixel * 1.5) {
      bestLevel = i;
    } else {
      break;
    }
  }

  const level = pyramid.levels[bestLevel];
  const levelScale = Math.pow(2, bestLevel);
  const bucketsPerSec = level.count / dur;
  const bucketStart = Math.max(0, Math.floor(s * bucketsPerSec));
  const bucketEnd = Math.min(level.count, Math.ceil(e * bucketsPerSec));

  const outMins = new Array(pixelWidth);
  const outMaxs = new Array(pixelWidth);
  const bucketSpan = bucketEnd - bucketStart;

  for (let px = 0; px < pixelWidth; px++) {
    const bStart = bucketStart + (px / pixelWidth) * bucketSpan;
    const bEnd = bucketStart + ((px + 1) / pixelWidth) * bucketSpan;
    const bi0 = Math.max(bucketStart, Math.floor(bStart));
    const bi1 = Math.min(bucketEnd, Math.ceil(bEnd));

    let lo = 1;
    let hi = -1;
    for (let b = bi0; b < bi1; b++) {
      if (level.mins[b] < lo) lo = level.mins[b];
      if (level.maxs[b] > hi) hi = level.maxs[b];
    }
    if (lo > hi) { lo = 0; hi = 0; }
    outMins[px] = lo;
    outMaxs[px] = hi;
  }

  return { mins: outMins, maxs: outMaxs, durationSec: dur, startSec: s, endSec: e };
}

/**
 * Legacy: get flat peak array (kept for backward compatibility during migration).
 */
export async function getPeaks(mediaId) {
  const pyramid = await ensurePyramid(mediaId);
  if (!pyramid || pyramid.levels.length === 0) {
    return { peaks: [], durationSec: 0 };
  }
  const level0 = pyramid.levels[0];
  const peaks = new Array(level0.count);
  for (let i = 0; i < level0.count; i++) {
    peaks[i] = Math.max(Math.abs(level0.mins[i]), Math.abs(level0.maxs[i]));
  }
  const maxPeak = Math.max(...peaks.slice(0, 1000), 1e-6);
  const scale = 1 / maxPeak;
  const normalized = peaks.map((p) => Math.min(1, p * scale));
  return { peaks: normalized, durationSec: pyramid.durationSec };
}
