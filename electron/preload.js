/**
 * Electron Preload Script
 * 
 * This is a bridge between Electron (desktop features) and your React app.
 * It safely exposes desktop capabilities (like file system access) to your app
 * without giving it full Node.js access (which would be a security risk).
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
try {
  contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Project operations
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    getById: (id) => ipcRenderer.invoke('projects:getById', id),
    create: (name, location) => ipcRenderer.invoke('projects:create', name, location),
    update: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
    delete: (id) => ipcRenderer.invoke('projects:delete', id),
    selectFolder: () => ipcRenderer.invoke('projects:selectFolder'),
    openFromFile: (filePath) => ipcRenderer.invoke('projects:openFromFile', filePath),
  },
  
  // Media operations
  media: {
    selectFiles: () => ipcRenderer.invoke('media:selectFiles'),
    getByProject: (projectId) => ipcRenderer.invoke('media:getByProject', projectId),
    addFiles: (projectId, filePaths) => ipcRenderer.invoke('media:addFiles', projectId, filePaths),
    refreshDurations: (projectId) => ipcRenderer.invoke('media:refreshDurations', projectId),
    updateClipName: (mediaId, name) => ipcRenderer.invoke('media:updateClipName', mediaId, name),
    setMasterAudio: (mediaId, isMaster) => ipcRenderer.invoke('media:setMasterAudio', mediaId, isMaster),
    updateHighlights: (mediaId, highlights) => ipcRenderer.invoke('media:updateHighlights', mediaId, highlights),
    delete: (mediaId) => ipcRenderer.invoke('media:delete', mediaId),
  },

  // Transcription
  transcription: {
    getByMediaId: (mediaId) => ipcRenderer.invoke('transcription:getByMediaId', mediaId),
    runForProject: (projectId) => ipcRenderer.invoke('transcription:runForProject', projectId),
  },

  // Waveform (peaks from main process via FFmpeg)
  waveform: {
    getPeaks: (mediaId) => ipcRenderer.invoke('waveform:getPeaks', mediaId),
  },

  // Export (FCP XML package for Premiere Pro)
  export: {
    exportFCPXMLPackage: (projectId, payload, projectName) =>
      ipcRenderer.invoke('export:exportFCPXMLPackage', projectId, payload, projectName),
    openFolder: (folderPath) => ipcRenderer.invoke('export:openFolder', folderPath),
  },
  });
  console.log('[Preload] electronAPI exposed successfully');
} catch (error) {
  console.error('[Preload] Failed to expose electronAPI:', error);
}
