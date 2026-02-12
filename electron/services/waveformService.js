/**
 * Waveform Service
 * Extracts audio via FFmpeg to a temp WAV, computes peak values in Node, returns to renderer via IPC.
 */

import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { app } from 'electron';
import { getFilePathForPlayback, getFfmpegCandidates, getFfmpegEnv } from './mediaService.js';

const execFileAsync = promisify(execFile);

/** Number of peak bars to return (matches renderer expectation). */
const NUM_PEAKS = 1500;

/** Standard PCM WAV header size. */
const WAV_HEADER_SIZE = 44;

/** Sample rate used for extraction (8 kHz is enough for waveform display). */
const SAMPLE_RATE = 8000;

/**
 * Get directory for temporary waveform WAV files. Creates it if missing.
 */
function getWaveformAudioDir() {
  const dir = join(app.getPath('userData'), 'waveform_audio');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Extract audio from a media file to 8 kHz mono WAV using FFmpeg.
 * @param {string} sourcePath - Path to source media (video or audio)
 * @param {string} wavPath - Output WAV path
 * @param {number} timeoutMs - Timeout in ms (default 60000)
 * @returns {Promise<boolean>}
 */
async function extractAudioTo8kWav(sourcePath, wavPath, timeoutMs = 60000) {
  const outDir = join(wavPath, '..');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const args = [
    '-y',
    '-i', sourcePath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    wavPath,
  ];
  const opts = { timeout: timeoutMs, env: getFfmpegEnv() };

  for (const ffmpegPath of getFfmpegCandidates()) {
    try {
      await execFileAsync(ffmpegPath, args, opts);
      if (existsSync(wavPath)) {
        return true;
      }
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
 * Read PCM samples from a standard 44-byte-header WAV (s16le mono) and compute normalized peaks.
 * @param {Buffer} buffer - Full file buffer
 * @param {number} numBars - Number of peak bars to return
 * @returns {{ peaks: number[], durationSec: number }}
 */
function readWavAndComputePeaks(buffer, numBars = NUM_PEAKS) {
  if (buffer.length <= WAV_HEADER_SIZE) {
    return { peaks: [], durationSec: 0 };
  }
  const numSamples = Math.floor((buffer.length - WAV_HEADER_SIZE) / 2);
  if (numSamples <= 0) {
    return { peaks: [], durationSec: 0 };
  }

  const step = numSamples / numBars;
  const peaks = [];

  for (let i = 0; i < numBars; i++) {
    const start = Math.floor(i * step) * 2 + WAV_HEADER_SIZE;
    const end = Math.min(Math.floor((i + 1) * step) * 2 + WAV_HEADER_SIZE, buffer.length - 1);
    let max = 0;
    for (let j = start; j < end; j += 2) {
      if (j + 1 < buffer.length) {
        const sample = buffer.readInt16LE(j);
        const abs = Math.abs(sample);
        if (abs > max) max = abs;
      }
    }
    peaks.push(max / 32768);
  }

  const maxPeak = Math.max(...peaks, 1e-6);
  const normalized = peaks.map((p) => p / maxPeak);
  const durationSec = numSamples / SAMPLE_RATE;

  return { peaks: normalized, durationSec };
}

/**
 * Get waveform peak values for a media item. Uses FFmpeg to extract audio to a temp WAV,
 * reads PCM, computes peaks, then deletes the temp file.
 * @param {number|string} mediaId - Media ID
 * @returns {Promise<{ peaks: number[], durationSec: number }>}
 * @throws {Error} If media not found, file missing, or FFmpeg extraction fails
 */
export async function getPeaks(mediaId) {
  const id = typeof mediaId === 'string' ? parseInt(mediaId, 10) : mediaId;
  if (!Number.isFinite(id)) {
    throw new Error('Invalid media id');
  }

  const filePath = getFilePathForPlayback(id);
  if (!filePath) {
    throw new Error('Media file not found');
  }

  const dir = getWaveformAudioDir();
  const wavPath = join(dir, `waveform_${id}.wav`);

  const extracted = await extractAudioTo8kWav(filePath, wavPath);
  if (!extracted) {
    throw new Error('Could not extract audio for waveform (install ffmpeg)');
  }

  try {
    const buffer = readFileSync(wavPath);
    const { peaks, durationSec } = readWavAndComputePeaks(buffer, NUM_PEAKS);
    return { peaks, durationSec };
  } finally {
    try {
      if (existsSync(wavPath)) {
        unlinkSync(wavPath);
      }
    } catch (e) {
      console.warn('[waveform] Could not delete temp WAV:', e?.message);
    }
  }
}
