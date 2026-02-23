import './loadEnv.js'; // Load .env.local first so DEEPGRAM_API_KEY etc. are available for transcription
import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import { initializeDatabase, closeDatabase } from './db/index.js';
import * as projectService from './services/projectService.js';
import * as mediaService from './services/mediaService.js';
import * as transcriptionService from './services/transcriptionService.js';
import * as waveformService from './services/waveformService.js';
import * as exportService from './services/exportService.js';
import * as aiService from './services/aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register custom thumbnail and media protocols before app ready (required for protocol.handle)
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumbnail', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  const preloadPath = join(__dirname, 'preload.js');
  
  // Verify preload script exists
  if (!existsSync(preloadPath)) {
    console.error(`[Main] Preload script not found at: ${preloadPath}`);
  } else {
    console.log(`[Main] Preload script found at: ${preloadPath}`);
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#021016', // Match design system background
    show: true, // Explicitly show the window
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Center the window on screen
  mainWindow.center();
  
  // Ensure window is shown and focused (macOS-specific handling)
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  
  // On macOS, ensure window is brought to front
  if (process.platform === 'darwin') {
    mainWindow.moveTop();
  }

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    // In development, load from Vite dev server
    // wait-on will wait for either port 5173 or 5174 to be available
    // Try 5173 first, if it fails Electron will show an error and we can check console
    mainWindow.loadURL('http://localhost:5173');
    
    // If 5173 fails, the page will show an error, but wait-on should handle this
    // by waiting for whichever port Vite actually uses
    mainWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      if (validatedURL.includes('5173')) {
        console.log('Port 5173 failed, trying 5174...');
        mainWindow.loadURL('http://localhost:5174');
      }
    });
    
    // Ensure window is visible after loading
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      if (process.platform === 'darwin') {
        mainWindow.moveTop();
      }
      console.log('[Main] Window should now be visible');
    });
    
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    const indexPath = join(__dirname, '../dist/index.html');
    if (existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    }
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Initialize database FIRST, before creating window or handling IPC calls
  try {
    initializeDatabase();
    console.log('[Main] Database initialized successfully');
  } catch (error) {
    console.error('[Main] CRITICAL: Failed to initialize database:', error);
    // Still create window so user can see the error
  }

  // Serve thumbnail images via custom protocol (so img src works in dev when file:// is blocked)
  protocol.handle('thumbnail', (request) => {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      const mediaId = parseInt(id, 10);
      if (!Number.isFinite(mediaId)) {
        return new Response(null, { status: 404 });
      }
      const thumbPath = mediaService.getThumbnailPath(mediaId);
      if (!thumbPath) {
        return new Response(null, { status: 404 });
      }
      const body = readFileSync(thumbPath);
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    } catch (err) {
      console.warn('[Main] Thumbnail protocol error:', err?.message);
      return new Response(null, { status: 500 });
    }
  });

  // Serve media files for video playback (supports Range for seeking)
  const VIDEO_MIME = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/x-m4v',
  };
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.replace(/^\/+/, '').split('/');
      const mediaId = parseInt(pathParts[pathParts.length - 1], 10);
      if (!Number.isFinite(mediaId)) {
        return new Response(null, { status: 404 });
      }
      const filePath = mediaService.getFilePathForPlayback(mediaId);
      if (!filePath) {
        return new Response(null, { status: 404 });
      }
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      const contentType = VIDEO_MIME[ext] || 'application/octet-stream';
      const stat = statSync(filePath);
      const fileSize = stat.size;
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const [, rangePart] = rangeHeader.split('=');
        const [startStr, endStr] = rangePart.split('-');
        const start = parseInt(startStr, 10) || 0;
        const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });
        const webStream = Readable.toWeb(stream);
        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
      const stream = createReadStream(filePath);
      const webStream = Readable.toWeb(stream);
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (err) {
      console.warn('[Main] Media protocol error:', err?.message);
      return new Response(null, { status: 500 });
    }
  });

  // Register media:delete inside whenReady so it is always available after app + DB init
  ipcMain.handle('media:delete', (event, mediaId) => {
    try {
      mediaService.deleteMedia(mediaId);
      return { success: true };
    } catch (error) {
      const message = (error && error.message) || String(error);
      return { success: false, error: message };
    }
  });

  // On macOS, ensure app is shown in dock
  if (process.platform === 'darwin') {
    app.dock.show();
  }

  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      // Bring existing window to front
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (window) {
          window.show();
          window.focus();
        }
      });
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Close database when app quits
app.on('before-quit', () => {
  closeDatabase();
});

// IPC handlers
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// Project IPC handlers
ipcMain.handle('projects:getAll', () => {
  try {
    return { success: true, data: projectService.getAllProjects() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:getById', (event, id) => {
  try {
    const project = projectService.getProjectById(id);
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:create', (event, name, location) => {
  try {
    // Ensure database is initialized before proceeding
    try {
      initializeDatabase();
    } catch (initError) {
      console.error('[Main] Database initialization failed in IPC handler:', initError);
      // Continue anyway - getDatabase() will throw a clearer error
    }
    
    const project = projectService.createProject(name, location);
    return { success: true, data: project };
  } catch (error) {
    console.error('[Main] Error creating project:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:update', (event, id, updates) => {
  try {
    const project = projectService.updateProject(id, updates);
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:delete', (event, id) => {
  try {
    const project = projectService.deleteProject(id);
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:selectFolder', async () => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'Main window not available' };
    }
    
    // Focus the main window to ensure dialog appears on top
    mainWindow.focus();
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Folder for New Project',
      buttonLabel: 'Select',
      message: 'Choose a folder where your project will be created',
      modal: true  // Explicitly set as modal
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('Dialog error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('projects:openFromFile', async (event, filePath) => {
  try {
    const project = projectService.openProjectFromFile(filePath);
    return { success: true, data: project };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Media IPC handlers
ipcMain.handle('media:selectFiles', async () => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'Main window not available' };
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Media Files',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'm4v'] },
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    return { success: true, files: result.filePaths };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:getByProject', (event, projectId) => {
  try {
    const mediaFiles = mediaService.getMediaByProject(projectId);
    return { success: true, data: mediaFiles };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:addFiles', async (event, projectId, filePaths) => {
  try {
    const results = await mediaService.addMediaFiles(projectId, filePaths);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:refreshDurations', async (event, projectId) => {
  try {
    await mediaService.refreshDurationsForProject(projectId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:updateClipName', (event, mediaId, name) => {
  try {
    mediaService.updateClipName(mediaId, name);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:setMasterAudio', (event, mediaId, isMaster) => {
  try {
    mediaService.setMasterAudio(mediaId, isMaster);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('media:updateHighlights', (event, mediaId, highlights) => {
  try {
    mediaService.updateMediaHighlights(mediaId, highlights);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Transcription IPC
ipcMain.handle('transcription:getByMediaId', (event, mediaId) => {
  try {
    const data = transcriptionService.getTranscriptByMediaId(mediaId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('transcription:runForProject', async (event, projectId) => {
  try {
    const result = await transcriptionService.runForProject(projectId);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('transcription:reTranscribeForMedia', async (event, mediaId) => {
  try {
    const result = await transcriptionService.reTranscribeForMedia(mediaId);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('transcription:updateSpeakerLabels', (event, mediaId, speakerLabels) => {
  try {
    const ok = transcriptionService.updateSpeakerLabels(mediaId, speakerLabels);
    return { success: ok };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Waveform IPC (legacy flat peaks — kept for backward compat)
ipcMain.handle('waveform:getPeaks', async (event, mediaId) => {
  try {
    const result = await waveformService.getPeaks(mediaId);
    return { success: true, peaks: result.peaks, durationSec: result.durationSec };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

// Waveform IPC (viewport-aware windowed min/max)
ipcMain.handle('waveform:getWindow', async (event, mediaId, startSec, endSec, pixelWidth) => {
  try {
    const result = await waveformService.getWindow(mediaId, startSec, endSec, pixelWidth);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

// Export (FCP XML package for Premiere)
ipcMain.handle('export:exportFCPXMLPackage', async (event, projectId, payload, projectName) => {
  try {
    return await exportService.exportFCPXMLPackage(mainWindow, projectId, payload, projectName);
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('export:openFolder', async (event, folderPath) => {
  try {
    if (folderPath && typeof folderPath === 'string') {
      await shell.openPath(folderPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

// AI (LLM-generated selects)
ipcMain.handle('ai:generateSelects', async (event, payload) => {
  try {
    const projectId = payload?.projectId;
    if (!projectId) {
      return { success: false, error: 'Missing projectId' };
    }
    const result = await aiService.generateSelectsForProject({
      projectId,
      storyContext: payload?.storyContext ?? '',
      styleContext: payload?.styleContext ?? '',
      userInstructions: payload?.userInstructions ?? '',
      desiredDurationSec: payload?.desiredDurationSec ?? 120,
    });
    return result;
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});
