/**
 * Project Service
 * Handles CRUD operations for projects
 */

import { getDatabase } from '../db/index.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

/**
 * Get default project location
 */
function getDefaultProjectLocation() {
  const documentsPath = app.getPath('documents');
  return join(documentsPath, 'AI Video Editing Projects');
}

/**
 * Parse the `selects_versions` JSON column into a normalized state object.
 * Returns a fresh empty state when input is missing or malformed.
 */
function parseSelectsVersions(raw) {
  const empty = {
    activeVersionId: null,
    lastStoryContext: '',
    lastDesiredDurationSec: 120,
    versions: [],
  };
  if (!raw || typeof raw !== 'string') return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    const versions = Array.isArray(parsed.versions) ? parsed.versions : [];
    return {
      activeVersionId: typeof parsed.activeVersionId === 'string' ? parsed.activeVersionId : null,
      lastStoryContext: typeof parsed.lastStoryContext === 'string' ? parsed.lastStoryContext : '',
      lastDesiredDurationSec: Number.isFinite(parsed.lastDesiredDurationSec)
        ? Number(parsed.lastDesiredDurationSec)
        : 120,
      versions: versions
        .filter((v) => v && typeof v === 'object' && typeof v.id === 'string')
        .map((v, idx) => ({
          id: v.id,
          label: typeof v.label === 'string' && v.label.trim() ? v.label : `v${idx + 1}`,
          createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
          storyContext: typeof v.storyContext === 'string' ? v.storyContext : '',
          desiredDurationSec: Number.isFinite(v.desiredDurationSec) ? Number(v.desiredDurationSec) : 120,
          snapshot: v.snapshot && typeof v.snapshot === 'object' ? v.snapshot : {},
        })),
    };
  } catch {
    return empty;
  }
}

/**
 * Write the normalized selects state back to the project row.
 */
function writeSelectsVersions(id, state) {
  const db = getDatabase();
  const json = JSON.stringify(state || parseSelectsVersions(null));
  const stmt = db.prepare(
    `UPDATE projects SET selects_versions = ?, updated_at = datetime('now') WHERE id = ?`
  );
  stmt.run(json, id);
}

/**
 * Read all media rows for a project and build a { "<mediaId>": highlights[] } snapshot
 * from the live `media.highlights` column.
 */
function buildSnapshotFromMedia(projectId) {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT id, highlights FROM media WHERE project_id = ?')
    .all(projectId);
  const snapshot = {};
  for (const row of rows) {
    if (!row.highlights || typeof row.highlights !== 'string') continue;
    try {
      const parsed = JSON.parse(row.highlights);
      if (Array.isArray(parsed) && parsed.length > 0) {
        snapshot[String(row.id)] = parsed;
      }
    } catch {
      // ignore malformed rows
    }
  }
  return snapshot;
}

/**
 * Generate a short, human-readable version id (also used as label).
 */
function nextVersionId(versions) {
  const n = Array.isArray(versions) ? versions.length + 1 : 1;
  return `v${n}`;
}

/**
 * Create a new project
 */
export function createProject(name, location = null) {
  const db = getDatabase();
  
  // Use default location if not provided
  const projectLocation = location || getDefaultProjectLocation();
  
  // Ensure project directory exists
  if (!existsSync(projectLocation)) {
    mkdirSync(projectLocation, { recursive: true });
  }
  
  // Create project folder with project name
  const projectFolder = join(projectLocation, name);
  if (!existsSync(projectFolder)) {
    mkdirSync(projectFolder, { recursive: true });
  }
  
  // Insert project into database
  const stmt = db.prepare(`
    INSERT INTO projects (name, context, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `);
  
  const result = stmt.run(name, JSON.stringify([]));
  const projectId = result.lastInsertRowid;
  
  // Create project file in the folder
  const projectFilePath = join(projectFolder, `${name}.aive`);
  const projectFileData = {
    id: projectId,
    name,
    location: projectFolder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  writeFileSync(projectFilePath, JSON.stringify(projectFileData, null, 2));
  
  return {
    id: projectId,
    name,
    location: projectFolder,
    projectFilePath,
    context: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get all projects
 */
export function getAllProjects() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, context, selects_versions, created_at, updated_at
    FROM projects
    ORDER BY updated_at DESC
  `);
  
  const projects = stmt.all();
  
  // Compute hasSelects per project: any media row with a non-empty highlights JSON array
  const hasSelectsStmt = db.prepare(`
    SELECT 1 FROM media
    WHERE project_id = ?
      AND highlights IS NOT NULL
      AND TRIM(highlights) <> ''
      AND TRIM(highlights) <> '[]'
    LIMIT 1
  `);

  return projects.map(project => {
    const versionsState = parseSelectsVersions(project.selects_versions);
    const hasMediaHighlights = !!hasSelectsStmt.get(project.id);
    const hasAnyVersion = Array.isArray(versionsState?.versions) && versionsState.versions.length > 0;
    return {
      id: project.id,
      name: project.name,
      context: project.context ? JSON.parse(project.context) : [],
      hasSelects: hasMediaHighlights || hasAnyVersion,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  });
}

/**
 * Get a project by ID
 */
export function getProjectById(id) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, context, created_at, updated_at
    FROM projects
    WHERE id = ?
  `);
  
  const project = stmt.get(id);
  
  if (!project) {
    return null;
  }
  
  return {
    id: project.id,
    name: project.name,
    context: project.context ? JSON.parse(project.context) : [],
    createdAt: project.created_at,
    updatedAt: project.updated_at
  };
}

/**
 * Update a project
 */
export function updateProject(id, updates) {
  const db = getDatabase();
  
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  
  if (updates.context !== undefined) {
    fields.push('context = ?');
    values.push(JSON.stringify(updates.context));
  }
  
  fields.push("updated_at = datetime('now')");
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE projects
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  
  stmt.run(...values);
  
  return getProjectById(id);
}

/**
 * Delete a project
 */
export function deleteProject(id) {
  const db = getDatabase();
  
  // Get project info before deleting
  const project = getProjectById(id);
  
  // Delete from database (CASCADE will handle related records)
  const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
  stmt.run(id);
  
  return project;
}

/**
 * Read the normalized selects state for a project. If the stored state has no versions
 * but the project already has highlights on media rows (legacy), bootstrap a single
 * `v1` snapshot from the live data so the UI always has at least one version to show.
 */
export function getSelectsState(projectId) {
  const db = getDatabase();
  const row = db.prepare('SELECT selects_versions FROM projects WHERE id = ?').get(projectId);
  if (!row) return parseSelectsVersions(null);

  let state = parseSelectsVersions(row.selects_versions);
  if (state.versions.length === 0) {
    const snapshot = buildSnapshotFromMedia(projectId);
    if (Object.keys(snapshot).length > 0) {
      const v1 = {
        id: 'v1',
        label: 'v1',
        createdAt: new Date().toISOString(),
        storyContext: '',
        desiredDurationSec: state.lastDesiredDurationSec,
        snapshot,
      };
      state = {
        ...state,
        activeVersionId: 'v1',
        versions: [v1],
      };
      writeSelectsVersions(projectId, state);
    }
  } else if (!state.activeVersionId) {
    state.activeVersionId = state.versions[state.versions.length - 1].id;
    writeSelectsVersions(projectId, state);
  }

  return state;
}

/**
 * Snapshot the current `media.highlights` as a new version. Sets the new version as active.
 * Also records the story context / desired duration used for this run so the Re-cut modal
 * can pre-fill next time.
 */
export function createSelectsVersion(projectId, { storyContext = '', desiredDurationSec = 120 } = {}) {
  const current = getSelectsState(projectId);
  const newId = nextVersionId(current.versions);
  const newVersion = {
    id: newId,
    label: newId,
    createdAt: new Date().toISOString(),
    storyContext: typeof storyContext === 'string' ? storyContext : '',
    desiredDurationSec: Number.isFinite(desiredDurationSec) ? Number(desiredDurationSec) : 120,
    snapshot: buildSnapshotFromMedia(projectId),
  };
  const next = {
    ...current,
    activeVersionId: newId,
    lastStoryContext: newVersion.storyContext,
    lastDesiredDurationSec: newVersion.desiredDurationSec,
    versions: [...current.versions, newVersion],
  };
  writeSelectsVersions(projectId, next);
  return next;
}

/**
 * Switch the active version. Writes the chosen version's snapshot back into each
 * `media.highlights` so the rest of the app (which reads highlights off the media row)
 * picks up the change on the next getMediaByProject() call.
 */
export function setActiveSelectsVersion(projectId, versionId) {
  const db = getDatabase();
  const state = getSelectsState(projectId);
  const target = state.versions.find((v) => v.id === versionId);
  if (!target) {
    throw new Error(`Version ${versionId} not found for project ${projectId}`);
  }

  // Reset all media.highlights for the project, then write the version's snapshot.
  const mediaRows = db
    .prepare('SELECT id FROM media WHERE project_id = ?')
    .all(projectId);
  const updateStmt = db.prepare('UPDATE media SET highlights = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const row of mediaRows) {
      const key = String(row.id);
      const list = Array.isArray(target.snapshot?.[key]) ? target.snapshot[key] : [];
      updateStmt.run(list.length > 0 ? JSON.stringify(list) : null, row.id);
    }
  });
  tx();

  const next = { ...state, activeVersionId: versionId };
  writeSelectsVersions(projectId, next);
  return next;
}

/**
 * Mirror the live `media.highlights` into the currently-active version's snapshot.
 * Called by the renderer (debounced) after manual edits on Timeline so the active
 * version always reflects what the user sees.
 */
export function updateActiveVersionFromMedia(projectId) {
  const state = getSelectsState(projectId);
  if (!state.activeVersionId || state.versions.length === 0) return state;
  const snapshot = buildSnapshotFromMedia(projectId);
  const next = {
    ...state,
    versions: state.versions.map((v) =>
      v.id === state.activeVersionId ? { ...v, snapshot } : v
    ),
  };
  writeSelectsVersions(projectId, next);
  return next;
}

/**
 * Open project from file path
 */
export function openProjectFromFile(filePath) {
  
  try {
    const projectData = JSON.parse(readFileSync(filePath, 'utf-8'));
    
    // Sync with database
    let project = getProjectById(projectData.id);
    
    if (!project) {
      // Project doesn't exist in DB, create it
      project = createProject(projectData.name, projectData.location);
    } else {
      // Update from file data
      project = updateProject(projectData.id, {
        name: projectData.name,
        context: projectData.context || []
      });
    }
    
    return project;
  } catch (error) {
    throw new Error(`Failed to open project file: ${error.message}`);
  }
}
