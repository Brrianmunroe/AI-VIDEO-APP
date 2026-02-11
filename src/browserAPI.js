/**
 * Browser API shim for when the app runs in a normal browser (e.g. Cursor Simple Browser)
 * instead of Electron. Provides in-memory/localStorage-backed implementations so you can
 * create projects, pick a "location", and upload files via a file input.
 *
 * Loaded before the app so window.electronAPI is defined when not in Electron.
 */

const BROWSER_PROJECTS_KEY = 'ai-video-editing-browser-projects';

function getStoredProjects() {
  try {
    const raw = localStorage.getItem(BROWSER_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredProjects(projects) {
  localStorage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(projects));
}

// In-memory media per project (session-only; object URLs don't persist)
const browserMediaStore = new Map();

function getMediaForProject(projectId) {
  const key = String(projectId);
  if (!browserMediaStore.has(key)) {
    browserMediaStore.set(key, []);
  }
  return browserMediaStore.get(key);
}

function nextMediaId(projectId) {
  const list = getMediaForProject(projectId);
  const max = list.length ? Math.max(...list.map((m) => m.id)) : 0;
  return max + 1;
}

function inferType(file) {
  if (!file || !file.type) return 'unknown';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  const n = (file.name || '').toLowerCase();
  if (/\.(mp4|mov|avi|mkv|m4v)$/.test(n)) return 'video';
  if (/\.(mp3|wav|aac|m4a|flac)$/.test(n)) return 'audio';
  return 'unknown';
}

export function installBrowserAPI() {
  if (typeof window === 'undefined') return;
  // Only install when running in a normal browser (Electron preload sets the real API first)
  if (window.electronAPI !== undefined) return;

  window.electronAPI = {
    _browserShim: true,

    getVersion: () => Promise.resolve('0.0.0-browser'),

    projects: {
      getAll: () => {
        const data = getStoredProjects();
        return Promise.resolve({ success: true, data });
      },
      getById: (id) => {
        const projects = getStoredProjects();
        const project = projects.find((p) => String(p.id) === String(id));
        return Promise.resolve(project ? { success: true, data: project } : { success: false });
      },
      create: (name, location) => {
        const projects = getStoredProjects();
        const id = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();
        const project = {
          id,
          name: name || 'Untitled',
          location: location || '/browser (default)',
          createdAt: now,
          updatedAt: now,
        };
        projects.unshift(project);
        setStoredProjects(projects);
        return Promise.resolve({ success: true, data: project });
      },
      update: (id, updates) => {
        const projects = getStoredProjects();
        const i = projects.findIndex((p) => String(p.id) === String(id));
        if (i < 0) return Promise.resolve({ success: false, error: 'Project not found' });
        projects[i] = { ...projects[i], ...updates, updatedAt: new Date().toISOString() };
        setStoredProjects(projects);
        return Promise.resolve({ success: true, data: projects[i] });
      },
      delete: (id) => {
        const projects = getStoredProjects().filter((p) => String(p.id) !== String(id));
        setStoredProjects(projects);
        browserMediaStore.delete(String(id));
        return Promise.resolve({ success: true });
      },
      selectFolder: () => {
        return Promise.resolve({
          success: true,
          path: '/browser (default)',
        });
      },
      openFromFile: () => Promise.resolve({ success: false, error: 'Not available in browser' }),
    },

    media: {
      selectFiles: () => {
        return Promise.resolve({ success: false, canceled: true });
      },
      getByProject: (projectId) => {
        const list = getMediaForProject(projectId);
        const data = list.map((m) => ({
          id: m.id,
          projectId: m.projectId,
          file_path: m.filePath,
          filePath: m.filePath,
          name: m.name,
          clipName: m.clipName,
          type: m.type,
          duration: m.duration,
          thumbnail: m.thumbnail,
          createdAt: m.createdAt,
        }));
        return Promise.resolve({ success: true, data });
      },
      addFiles: (projectId, files) => {
        if (!files || !Array.isArray(files) || files.length === 0) {
          return Promise.resolve({ success: true });
        }
        const list = getMediaForProject(projectId);
        const isFileList = files[0] instanceof File;
        const toAdd = isFileList ? files : [];
        for (const file of toAdd) {
          const id = nextMediaId(projectId);
          const filePath = URL.createObjectURL(file);
          const name = file.name || `File ${id}`;
          const type = inferType(file);
          list.push({
            id,
            projectId: String(projectId),
            filePath,
            name,
            clipName: name,
            type,
            duration: 0,
            thumbnail: null,
            createdAt: new Date().toISOString(),
          });
        }
        return Promise.resolve({ success: true });
      },
      refreshDurations: () => Promise.resolve({ success: true }),
      updateClipName: (mediaId, newName) => {
        for (const list of browserMediaStore.values()) {
          const m = list.find((x) => x.id === mediaId);
          if (m) {
            m.clipName = newName;
            return Promise.resolve({ success: true });
          }
        }
        return Promise.resolve({ success: false, error: 'Not found' });
      },
      setMasterAudio: () => Promise.resolve({ success: true }),
      delete: (mediaId) => {
        for (const list of browserMediaStore.values()) {
          const i = list.findIndex((x) => x.id === mediaId);
          if (i >= 0) {
            const m = list[i];
            if (m.filePath && m.filePath.startsWith('blob:')) {
              URL.revokeObjectURL(m.filePath);
            }
            list.splice(i, 1);
            return Promise.resolve({ success: true });
          }
        }
        return Promise.resolve({ success: false, error: 'Not found' });
      },
    },
  };
}
