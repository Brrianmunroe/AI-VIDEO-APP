/**
 * Export Service
 * FCP 7 XML + media package for Premiere Pro (File → Import XML, no relinking).
 */

import { dialog } from 'electron';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import * as mediaService from './mediaService.js';

/** Build pathurl to match Premiere export: file://localhost/ + path, URL-encoded. */
function pathToPathurl(absolutePath) {
  let normalized = absolutePath.replace(/\\/g, '/');
  if (normalized.length >= 2 && normalized[1] === ':') {
    normalized = '/' + normalized;
  }
  return 'file://localhost' + encodeURI(normalized);
}

const FPS = 24;
const MEDIA_DIR = 'Media';
const XML_FILENAME = 'Timeline.xml';
const README_FILENAME = 'README.txt';

/** Remove characters that are unsafe in macOS/Windows filenames; trim and collapse whitespace. */
function sanitizeFolderName(name) {
  const raw = (name == null ? '' : String(name)).trim();
  const cleaned = raw
    .replace(/[\/\\:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : 'Timeline';
}

/** Return a folder path inside `parent` that does not exist yet, appending " 2", " 3", ... on collision. */
function uniqueFolderPath(parent, baseName) {
  let candidate = join(parent, baseName);
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(parent, `${baseName} ${n}`);
    n++;
  }
  return candidate;
}

/**
 * Assign unique filenames for copied media (dedupe by path, avoid basename collisions).
 * Returns Map: sourceFilePath -> filename in Media/
 */
function planMediaCopies(videoClips, getFilePath) {
  const pathToFilename = new Map();
  const usedBasenames = new Set();

  for (const seg of videoClips) {
    const srcPath = getFilePath(seg.sourceMediaId);
    if (!srcPath || pathToFilename.has(srcPath)) continue;

    let name = basename(srcPath);
    if (usedBasenames.has(name)) {
      let i = 1;
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
      const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
      while (usedBasenames.has(base + '_' + i + ext)) i++;
      name = base + '_' + i + ext;
    }
    usedBasenames.add(name);
    pathToFilename.set(srcPath, name);
  }
  return pathToFilename;
}

/**
 * Build Premiere-style FCP XML: sequence at root (no project/bin), full file only in first clipitem per source.
 * masterClips: array of { fileId, masterId, filename, pathurl, durationFrames }
 * clipItems: array of { name, fileId, durationFrames, inFrames, outFrames, startFrame, endFrame }
 */
function buildFCPXML(sequenceName, masterClips, clipItems, timebase = FPS) {
  const totalFrames = clipItems.length > 0
    ? Math.max(...clipItems.map((c) => c.endFrame))
    : 0;

  const escape = (s) => {
    if (s == null) return '';
    const str = String(s);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const fileIdToMasterclipId = new Map(masterClips.map((m, i) => [m.fileId, 'masterclip-' + (i + 1)]));
  const fileIdToMaster = new Map(masterClips.map((m) => [m.fileId, m]));
  const firstClipitemIndexForFileId = new Map();
  clipItems.forEach((c, i) => {
    if (!firstClipitemIndexForFileId.has(c.fileId)) firstClipitemIndexForFileId.set(c.fileId, i);
  });

  const clipItemBlocks = [];
  const audioClipItemBlocks = [];
  for (let i = 0; i < clipItems.length; i++) {
    const c = clipItems[i];
    const videoClipId = 'clipitem-' + (i + 1);
    const audioClipId = 'clipitem-' + (i + 1) + '-audio';
    const masterclipid = fileIdToMasterclipId.get(c.fileId) || '';
    const isFirstForFile = firstClipitemIndexForFileId.get(c.fileId) === i;
    const master = fileIdToMaster.get(c.fileId);

    let fileBlock;
    if (isFirstForFile && master) {
      fileBlock =
        '            <file id="' + escape(c.fileId) + '">\n' +
        '              <name>' + escape(master.filename) + '</name>\n' +
        '              <pathurl>' + escape(master.pathurl) + '</pathurl>\n' +
        '              <rate>\n                <timebase>' + timebase + '</timebase>\n                <ntsc>FALSE</ntsc>\n              </rate>\n' +
        '              <duration>' + master.durationFrames + '</duration>\n' +
        '              <timecode>\n                <rate><timebase>' + timebase + '</timebase><ntsc>FALSE</ntsc></rate>\n                <string>00:00:00:00</string>\n                <frame>0</frame>\n                <displayformat>NDF</displayformat>\n              </timecode>\n' +
        '              <media>\n                <video><samplecharacteristics><rate><timebase>' + timebase + '</timebase><ntsc>FALSE</ntsc></rate><width>1920</width><height>1080</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>\n                <audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>\n              </media>\n' +
        '            </file>';
    } else {
      fileBlock = '            <file id="' + escape(c.fileId) + '"/>';
    }

    clipItemBlocks.push(
      '            <clipitem id="' + escape(videoClipId) + '">\n' +
      '              <masterclipid>' + escape(masterclipid) + '</masterclipid>\n' +
      '              <name>' + escape(c.name) + '</name>\n' +
      '              <enabled>TRUE</enabled>\n' +
      '              <duration>' + c.durationFrames + '</duration>\n' +
      '              <rate>\n                <timebase>' + timebase + '</timebase>\n                <ntsc>FALSE</ntsc>\n              </rate>\n' +
      '              <start>' + c.startFrame + '</start>\n' +
      '              <end>' + c.endFrame + '</end>\n' +
      '              <in>' + c.inFrames + '</in>\n' +
      '              <out>' + c.outFrames + '</out>\n' +
      fileBlock + '\n' +
      '              <link>\n                <linkclipref>' + escape(audioClipId) + '</linkclipref>\n              </link>\n' +
      '              <sourcetrack>\n                <mediatype>video</mediatype>\n                <trackindex>1</trackindex>\n              </sourcetrack>\n' +
      '            </clipitem>'
    );

    audioClipItemBlocks.push(
      '            <clipitem id="' + escape(audioClipId) + '">\n' +
      '              <masterclipid>' + escape(masterclipid) + '</masterclipid>\n' +
      '              <name>' + escape(c.name) + '</name>\n' +
      '              <enabled>TRUE</enabled>\n' +
      '              <duration>' + c.durationFrames + '</duration>\n' +
      '              <rate>\n                <timebase>' + timebase + '</timebase>\n                <ntsc>FALSE</ntsc>\n              </rate>\n' +
      '              <start>' + c.startFrame + '</start>\n' +
      '              <end>' + c.endFrame + '</end>\n' +
      '              <in>' + c.inFrames + '</in>\n' +
      '              <out>' + c.outFrames + '</out>\n' +
      '              <file id="' + escape(c.fileId) + '"/>\n' +
      '              <link>\n                <linkclipref>' + escape(videoClipId) + '</linkclipref>\n              </link>\n' +
      '              <sourcetrack>\n                <mediatype>audio</mediatype>\n                <trackindex>1</trackindex>\n              </sourcetrack>\n' +
      '            </clipitem>'
    );
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE xmeml>\n' +
    '<xmeml version="4">\n' +
    '  <sequence id="sequence-1">\n' +
    '    <duration>' + totalFrames + '</duration>\n' +
    '    <rate>\n      <timebase>' + timebase + '</timebase>\n      <ntsc>FALSE</ntsc>\n    </rate>\n' +
    '    <name>' + escape(sequenceName) + '</name>\n' +
    '    <media>\n' +
    '      <video>\n' +
    '        <format>\n          <samplecharacteristics>\n            <rate><timebase>' + timebase + '</timebase><ntsc>FALSE</ntsc></rate>\n            <width>1920</width>\n            <height>1080</height>\n            <anamorphic>FALSE</anamorphic>\n            <pixelaspectratio>square</pixelaspectratio>\n            <fielddominance>lower</fielddominance>\n            <colordepth>24</colordepth>\n          </samplecharacteristics>\n        </format>\n' +
    '        <track>\n' +
    clipItemBlocks.join('\n') + '\n' +
    '          <enabled>TRUE</enabled>\n          <locked>FALSE</locked>\n' +
    '        </track>\n' +
    '      </video>\n' +
    '      <audio>\n        <numOutputChannels>2</numOutputChannels>\n        <format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>\n        <outputs><group><index>1</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>1</index></channel></group><group><index>2</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>2</index></channel></group></outputs>\n        <track>\n' +
    audioClipItemBlocks.join('\n') + '\n' +
    '          <enabled>TRUE</enabled>\n          <locked>FALSE</locked>\n        </track>\n        <track><enabled>TRUE</enabled><locked>FALSE</locked></track>\n      </audio>\n' +
    '    </media>\n' +
    '    <timecode>\n      <rate><timebase>' + timebase + '</timebase><ntsc>FALSE</ntsc></rate>\n      <string>00:00:00:00</string>\n      <frame>0</frame>\n      <displayformat>NDF</displayformat>\n    </timecode>\n' +
    '  </sequence>\n' +
    '</xmeml>\n'
  );
}

/**
 * Export timeline as FCP 7 XML package: choose folder, copy media, write XML + README.
 * @param {Electron.BrowserWindow} browserWindow
 * @param {number} projectId
 * @param {{ videoClips: Array }} payload - segments with sourceMediaId, sourceInSec, sourceOutSec, startFrame, durationFrames, label
 * @param {string} [projectName] - used for sequence name and README
 */
export async function exportFCPXMLPackage(browserWindow, projectId, payload, projectName = 'Timeline') {
  const videoClips = Array.isArray(payload?.videoClips) ? payload.videoClips : [];
  if (videoClips.length === 0) {
    return { success: false, error: 'No segments to export' };
  }

  const getFilePath = (mediaId) => mediaService.getFilePathForPlayback(mediaId);
  const pathToFilename = planMediaCopies(videoClips, getFilePath);
  if (pathToFilename.size === 0) {
    return { success: false, error: 'Could not resolve source files for any segment' };
  }

  if (!browserWindow) {
    return { success: false, error: 'Window not available for dialog' };
  }

  const folderName = sanitizeFolderName(projectName);

  const result = await dialog.showOpenDialog(browserWindow, {
    title: 'Choose Export Location for Premiere',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select',
    message: `A folder named "${folderName}" will be created here, containing Media/ and ${XML_FILENAME}.`,
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { success: false, canceled: true };
  }

  const parentFolder = result.filePaths[0];
  const exportFolder = uniqueFolderPath(parentFolder, folderName);
  const mediaFolder = join(exportFolder, MEDIA_DIR);

  try {
    mkdirSync(mediaFolder, { recursive: true });
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }

  const pathToWritten = new Map();
  for (const [srcPath, filename] of pathToFilename) {
    const destPath = join(mediaFolder, filename);
    try {
      copyFileSync(srcPath, destPath);
      pathToWritten.set(srcPath, { filename, pathurl: pathToPathurl(destPath) });
    } catch (err) {
      console.error('[Export] Copy failed:', srcPath, destPath, err);
      return { success: false, error: `Failed to copy ${filename}: ${err?.message || err}` };
    }
  }

  const maxOutFrameByPath = new Map();
  for (const seg of videoClips) {
    const srcPath = getFilePath(seg.sourceMediaId);
    if (!srcPath) continue;
    const outFrames = Math.round((Number(seg.sourceOutSec) || 0) * FPS);
    const current = maxOutFrameByPath.get(srcPath) ?? 0;
    maxOutFrameByPath.set(srcPath, Math.max(current, outFrames));
  }

  const masterClips = [];
  const pathToFileId = new Map();
  let idx = 0;
  for (const [srcPath, written] of pathToWritten) {
    idx++;
    const fileId = 'file-' + idx;
    const masterId = 'master-' + idx;
    pathToFileId.set(srcPath, fileId);
    masterClips.push({
      fileId,
      masterId,
      filename: written.filename,
      pathurl: written.pathurl,
      durationFrames: maxOutFrameByPath.get(srcPath) || 1,
    });
  }

  const clipItems = [];
  for (const seg of videoClips) {
    const srcPath = getFilePath(seg.sourceMediaId);
    const written = srcPath ? pathToWritten.get(srcPath) : null;
    const fileId = srcPath ? pathToFileId.get(srcPath) : null;
    if (!written || !fileId) continue;

    const inSec = Number(seg.sourceInSec) || 0;
    const outSec = Number(seg.sourceOutSec) || 0;
    const startFrame = Number(seg.startFrame) || 0;
    const durationFrames = Number(seg.durationFrames) || 0;
    const endFrame = startFrame + durationFrames;
    const inFrames = Math.round(inSec * FPS);
    const outFrames = Math.round(outSec * FPS);

    clipItems.push({
      name: seg.label || `Clip ${seg.id}`,
      fileId,
      durationFrames,
      inFrames,
      outFrames,
      startFrame,
      endFrame,
    });
  }

  if (clipItems.length === 0) {
    return { success: false, error: 'No valid segments to export' };
  }

  const sequenceName = (projectName && String(projectName).trim()) ? String(projectName).trim() : 'Timeline';
  const xml = buildFCPXML(sequenceName, masterClips, clipItems);
  const xmlPath = join(exportFolder, XML_FILENAME);
  writeFileSync(xmlPath, xml, 'utf8');

  const readme = [
    'Premiere Pro – Import this timeline',
    '',
    '1. Open Adobe Premiere Pro.',
    '2. File → Import… and select: ' + XML_FILENAME,
    '3. The sequence "' + sequenceName + '" will appear with your selects already cut.',
    '4. Media is in the ' + MEDIA_DIR + '/ folder; no relinking needed if you keep this folder structure.',
    '',
    'You can move or zip this entire folder; keep ' + XML_FILENAME + ' and the ' + MEDIA_DIR + '/ folder together.',
  ].join('\n');
  writeFileSync(join(exportFolder, README_FILENAME), readme, 'utf8');

  return { success: true, path: exportFolder };
}
