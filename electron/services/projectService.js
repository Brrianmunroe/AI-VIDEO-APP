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
    SELECT id, name, context, created_at, updated_at
    FROM projects
    ORDER BY updated_at DESC
  `);
  
  const projects = stmt.all();
  
  return projects.map(project => ({
    id: project.id,
    name: project.name,
    context: project.context ? JSON.parse(project.context) : [],
    createdAt: project.created_at,
    updatedAt: project.updated_at
  }));
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
