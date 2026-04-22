/**
 * Media Service
 * Handles media file operations and database storage
 */

import { getDatabase } from '../db/index.js';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { join } from 'path';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

/** Common paths where ffprobe is installed (Electron often has minimal PATH) */
function getFfprobeCandidates() {
  const candidates = ['ffprobe'];
  if (platform() === 'darwin') {
    candidates.push('/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe');
  }
  if (platform() === 'win32') {
    candidates.push('C:\\ffmpeg\\bin\\ffprobe.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe');
  }
  return candidates;
}

/** Common paths where ffmpeg is installed (Electron often has minimal PATH) */
export function getFfmpegCandidates() {
  const candidates = ['ffmpeg'];
  if (platform() === 'darwin') {
    candidates.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg');
  }
  if (platform() === 'win32') {
    candidates.push('C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe');
  }
  return candidates;
}

/** env with extended PATH so ffprobe/ffmpeg is found when Electron has minimal PATH */
function getFfprobeEnv() {
  const extra = process.platform === 'win32' ? '' : ':/usr/local/bin:/opt/homebrew/bin';
  return { ...process.env, PATH: (process.env.PATH || '') + extra };
}

/** Exported for use by waveformService (FFmpeg extraction). */
export function getFfmpegEnv() {
  return getFfprobeEnv();
}

/** Thumbnails directory under userData; creates it if missing */
function getThumbnailsDir() {
  const dir = join(app.getPath('userData'), 'thumbnails');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Filmstrips directory under userData; creates it if missing */
function getFilmstripsDir() {
  const dir = join(app.getPath('userData'), 'filmstrips');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Number of frames sampled across the video for the timeline filmstrip. */
const FILMSTRIP_FRAME_COUNT = 20;
/** Width of each sampled frame (px). Aspect-preserving scale keeps things small on disk. */
const FILMSTRIP_FRAME_WIDTH = 160;

/**
 * Extract a single frame from a video as JPEG at outputPath.
 * Uses -ss 00:00:01 to avoid black frame at start.
 * Returns true if extraction succeeded, false otherwise (logs on failure).
 */
async function extractThumbnail(videoPath, outputPath) {
  const outDir = join(outputPath, '..');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const args = [
    '-y',
    '-i', videoPath,
    '-ss', '00:00:01',
    '-vframes', '1',
    '-q:v', '2',
    outputPath
  ];
  const opts = { timeout: 30000, env: getFfmpegEnv() };

  for (const ffmpegPath of getFfmpegCandidates()) {
    try {
      await execFileAsync(ffmpegPath, args, opts);
      if (existsSync(outputPath)) {
        return true;
      }
    } catch (err) {
      if (ffmpegPath === 'ffmpeg' && err?.code === 'ENOENT') {
        console.warn('[media] ffmpeg not in PATH; trying known install locations for thumbnail.');
      }
      continue;
    }
  }
  console.warn('[media] Could not extract thumbnail for', videoPath.split(/[/\\]/).pop(), '(install ffmpeg for thumbnails)');
  return false;
}

/**
 * Extract a horizontal filmstrip sprite (N evenly-spaced frames tiled into one JPEG).
 * Used as the background image on the timeline video track so the clip shows real
 * frames from the media, similar to Premiere's clip preview.
 *
 * Uses the `tile` filter: `fps=N/D` samples N frames across D seconds, then
 * `tile=Nx1` composes them into a single row.
 */
async function extractFilmstrip(videoPath, outputPath, durationSec) {
  const outDir = join(outputPath, '..');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  const filter = `fps=${FILMSTRIP_FRAME_COUNT}/${safeDuration},scale=${FILMSTRIP_FRAME_WIDTH}:-1,tile=${FILMSTRIP_FRAME_COUNT}x1`;
  const args = [
    '-y',
    '-i', videoPath,
    '-vf', filter,
    '-frames:v', '1',
    '-q:v', '3',
    outputPath,
  ];
  const opts = { timeout: 60000, env: getFfmpegEnv() };

  for (const ffmpegPath of getFfmpegCandidates()) {
    try {
      await execFileAsync(ffmpegPath, args, opts);
      if (existsSync(outputPath)) {
        return true;
      }
    } catch (err) {
      if (ffmpegPath === 'ffmpeg' && err?.code === 'ENOENT') {
        console.warn('[media] ffmpeg not in PATH; trying known install locations for filmstrip.');
      }
      continue;
    }
  }
  console.warn('[media] Could not extract filmstrip for', videoPath.split(/[/\\]/).pop());
  return false;
}

/**
 * Get duration in seconds from a media file using ffprobe (if available).
 * Tries 'ffprobe' first (with extended PATH), then known install paths, so it works
 * when Electron's PATH doesn't include ffmpeg.
 * Returns 0 if ffprobe is not available or fails.
 */
async function getMediaDurationSeconds(filePath) {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ];
  const opts = { timeout: 15000, env: getFfprobeEnv() };

  for (const ffprobePath of getFfprobeCandidates()) {
    try {
      const { stdout } = await execFileAsync(ffprobePath, args, opts);
      const duration = parseFloat(String(stdout).trim(), 10);
      if (Number.isFinite(duration) && duration >= 0) {
        return duration;
      }
    } catch (err) {
      if (ffprobePath === 'ffprobe' && err?.code === 'ENOENT') {
        console.warn('[media] ffprobe not in PATH; trying known install locations for duration.');
      }
      continue;
    }
  }
  console.warn('[media] Could not get duration for', filePath.split('/').pop(), '(install ffmpeg for accurate duration)');
  return 0;
}

/**
 * Extract audio from a video or audio file to 16 kHz mono WAV (for Whisper transcription).
 * Creates the output directory if missing. Uses ffmpeg with same discovery as thumbnail/duration.
 * @param {string} sourcePath - Path to the source media file (video or audio)
 * @param {string} wavOutputPath - Path for the output WAV file
 * @returns {Promise<boolean>} - true if extraction succeeded and output file exists, false otherwise
 */
export async function extractAudioTo16kWav(sourcePath, wavOutputPath) {
  if (!sourcePath || !wavOutputPath) return false;
  const outDir = join(wavOutputPath, '..');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const args = [
    '-y',
    '-i', sourcePath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    wavOutputPath,
  ];
  const opts = { timeout: 300000, env: getFfmpegEnv() };

  for (const ffmpegPath of getFfmpegCandidates()) {
    try {
      await execFileAsync(ffmpegPath, args, opts);
      if (existsSync(wavOutputPath)) {
        return true;
      }
    } catch (err) {
      if (ffmpegPath === 'ffmpeg' && err?.code === 'ENOENT') {
        console.warn('[media] ffmpeg not in PATH; trying known install locations for audio extraction.');
      }
      continue;
    }
  }
  console.warn('[media] Could not extract audio to 16kHz WAV for', sourcePath.split(/[/\\]/).pop(), '(install ffmpeg for transcription)');
  return false;
}

/**
 * Get all media files for a project
 */
export function getMediaByProject(projectId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, project_id, file_path, storage_type, storage_provider,
           proxy_path, camera_audio_path, master_audio_path, audio_sync_offset,
           duration, width, height, clip_name, thumbnail_path, highlights, created_at
    FROM media
    WHERE project_id = ?
    ORDER BY created_at DESC
  `);
  
  const mediaFiles = stmt.all(projectId);
  const fallbackName = (path) => path.split(/[/\\]/).pop();
  
  return mediaFiles.map(media => {
    // A file is master audio if master_audio_path equals its own file_path
    // (meaning it's designated as a master audio file)
    const isMasterAudio = !!media.master_audio_path && media.master_audio_path === media.file_path;
    const thumbPath = media.thumbnail_path || null;
    const thumbnail = (thumbPath && existsSync(thumbPath))
      ? `thumbnail://local/${media.id}`
      : null;
    let highlights = null;
    if (media.highlights != null && typeof media.highlights === 'string' && media.highlights.trim()) {
      try {
        highlights = JSON.parse(media.highlights);
        if (!Array.isArray(highlights)) highlights = null;
      } catch {
        highlights = null;
      }
    }

    return {
      id: media.id,
      projectId: media.project_id,
      filePath: media.file_path,
      storageType: media.storage_type,
      storageProvider: media.storage_provider,
      proxyPath: media.proxy_path,
      cameraAudioPath: media.camera_audio_path,
      masterAudioPath: media.master_audio_path,
      audioSyncOffset: media.audio_sync_offset,
      duration: media.duration,
      width: media.width,
      height: media.height,
      createdAt: media.created_at,
      name: fallbackName(media.file_path),
      clipName: (media.clip_name && media.clip_name.trim()) ? media.clip_name.trim() : fallbackName(media.file_path),
      type: media.file_path.match(/\.(mp4|mov|avi|mkv|m4v)$/i) ? 'video' : 
            media.file_path.match(/\.(mp3|wav|aac|m4a|flac)$/i) ? 'audio' : 'unknown',
      isMasterAudio,
      thumbnail,
      highlights
    };
  });
}

/**
 * Update highlights for a media item (JSON array of { id, in, out }).
 */
export function updateMediaHighlights(mediaId, highlights) {
  const db = getDatabase();
  const json = Array.isArray(highlights) ? JSON.stringify(highlights) : null;
  const stmt = db.prepare('UPDATE media SET highlights = ? WHERE id = ?');
  stmt.run(json, mediaId);
}

/**
 * Add media files to a project.
 * Extracts duration via ffprobe when available so the card timestamp matches media length.
 */
export async function addMediaFiles(projectId, filePaths) {
  const db = getDatabase();
  const results = [];
  
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      console.warn(`File does not exist: ${filePath}`);
      continue;
    }
    
    const fileName = filePath.split(/[/\\]/).pop();
    const isVideo = /\.(mp4|mov|avi|mkv|m4v)$/i.test(filePath);
    const isAudio = /\.(mp3|wav|aac|m4a|flac)$/i.test(filePath);
    
    let duration = 0;
    if (isVideo || isAudio) {
      duration = await getMediaDurationSeconds(filePath);
    }
    
    const stmt = db.prepare(`
      INSERT INTO media (
        project_id, file_path, storage_type, duration, created_at
      )
      VALUES (?, ?, 'local', ?, datetime('now'))
    `);
    const result = stmt.run(projectId, filePath, duration);
    const mediaId = result.lastInsertRowid;

    let thumbnailPath = null;
    if (isVideo) {
      const thumbDir = getThumbnailsDir();
      const thumbPath = join(thumbDir, `${mediaId}.jpg`);
      const extracted = await extractThumbnail(filePath, thumbPath);
      if (extracted) {
        thumbnailPath = thumbPath;
        const updateStmt = db.prepare('UPDATE media SET thumbnail_path = ? WHERE id = ?');
        updateStmt.run(thumbnailPath, mediaId);
      }
    }

    results.push({
      id: mediaId,
      projectId,
      filePath,
      name: fileName,
      type: isVideo ? 'video' : isAudio ? 'audio' : 'unknown',
      duration,
      thumbnailPath,
      createdAt: new Date().toISOString()
    });
  }
  
  return results;
}

/**
 * Refresh duration for all media in a project using ffprobe.
 * Re-reads each file so card timestamps always reflect actual media length.
 */
export async function refreshDurationsForProject(projectId) {
  const db = getDatabase();
  const rows = db.prepare('SELECT id, file_path FROM media WHERE project_id = ?').all(projectId);
  const isVideoOrAudio = (p) => /\.(mp4|mov|avi|mkv|m4v|mp3|wav|aac|m4a|flac)$/i.test(p);
  const updateStmt = db.prepare('UPDATE media SET duration = ? WHERE id = ?');
  for (const row of rows) {
    if (!existsSync(row.file_path) || !isVideoOrAudio(row.file_path)) continue;
    const duration = await getMediaDurationSeconds(row.file_path);
    updateStmt.run(duration >= 0 ? duration : 0, row.id);
  }
  return { success: true };
}

/**
 * Update clip name (persisted in media.clip_name)
 */
export function updateClipName(mediaId, name) {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE media SET clip_name = ? WHERE id = ?');
  const result = stmt.run(name == null ? null : String(name).trim(), mediaId);
  return { success: true, changes: result.changes };
}

/**
 * Delete a media item from the project. Removes DB row (transcripts/selects cascade)
 * and deletes the thumbnail file from disk if present.
 */
export function deleteMedia(mediaId) {
  const id = Number(mediaId);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error('Invalid media id');
  }
  const db = getDatabase();
  const row = db.prepare('SELECT thumbnail_path FROM media WHERE id = ?').get(id);
  if (!row) {
    throw new Error('Media not found');
  }
  if (row.thumbnail_path && existsSync(row.thumbnail_path)) {
    try {
      unlinkSync(row.thumbnail_path);
    } catch (err) {
      console.warn('[media] Could not remove thumbnail file:', row.thumbnail_path, err?.message);
    }
  }
  const filmstripPath = join(getFilmstripsDir(), `${id}.jpg`);
  if (existsSync(filmstripPath)) {
    try {
      unlinkSync(filmstripPath);
    } catch (err) {
      console.warn('[media] Could not remove filmstrip file:', filmstripPath, err?.message);
    }
  }
  db.prepare('DELETE FROM media WHERE id = ?').run(id);
  return { success: true };
}

/**
 * Get the filesystem path for a media item's thumbnail (for use by custom protocol).
 * Returns null if no thumbnail or file does not exist.
 */
export function getThumbnailPath(mediaId) {
  const db = getDatabase();
  const row = db.prepare('SELECT thumbnail_path FROM media WHERE id = ?').get(mediaId);
  const path = row?.thumbnail_path || null;
  return path && existsSync(path) ? path : null;
}

/**
 * Get (and lazily generate) the filmstrip sprite JPEG for a media item. The filmstrip is
 * a horizontally-tiled strip of N frames used as the video track background on the timeline.
 * Cached in `userData/filmstrips/{mediaId}.jpg`; (re)generates if missing.
 * Returns null for non-video media or when ffmpeg is unavailable.
 */
export async function getFilmstripPath(mediaId) {
  const id = Number(mediaId);
  if (!Number.isFinite(id) || id < 1) return null;
  const db = getDatabase();
  const row = db.prepare('SELECT file_path, duration FROM media WHERE id = ?').get(id);
  if (!row || !row.file_path) return null;
  const isVideo = /\.(mp4|mov|avi|mkv|m4v)$/i.test(row.file_path);
  if (!isVideo) return null;
  if (!existsSync(row.file_path)) return null;
  const dir = getFilmstripsDir();
  const outPath = join(dir, `${id}.jpg`);
  if (existsSync(outPath)) return outPath;
  const ok = await extractFilmstrip(row.file_path, outPath, Number(row.duration) || 0);
  return ok ? outPath : null;
}

/**
 * Get the filesystem path for a media item's source file (for playback via custom protocol).
 * Returns null if media not found or file does not exist.
 */
export function getFilePathForPlayback(mediaId) {
  const db = getDatabase();
  const row = db.prepare('SELECT file_path FROM media WHERE id = ?').get(mediaId);
  const path = row?.file_path || null;
  return path && existsSync(path) ? path : null;
}

/**
 * Set master audio designation
 * When a file is designated as master audio, we set master_audio_path to its own path
 * This indicates the file IS a master audio file (external recording)
 */
export function setMasterAudio(mediaId, isMaster) {
  const db = getDatabase();
  
  // Get the media file
  const getStmt = db.prepare('SELECT file_path FROM media WHERE id = ?');
  const media = getStmt.get(mediaId);
  
  if (!media) {
    throw new Error('Media file not found');
  }
  
  if (isMaster) {
    // Designate this file as master audio (it IS a master audio file)
    // Set master_audio_path to its own path to mark it
    const updateStmt = db.prepare(`
      UPDATE media
      SET master_audio_path = ?
      WHERE id = ?
    `);
    updateStmt.run(media.file_path, mediaId);
  } else {
    // Remove master audio designation
    const updateStmt = db.prepare(`
      UPDATE media
      SET master_audio_path = NULL
      WHERE id = ?
    `);
    updateStmt.run(mediaId);
  }
  
  return { success: true };
}
