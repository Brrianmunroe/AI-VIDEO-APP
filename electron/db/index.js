/**
 * Database initialization and connection
 * Uses better-sqlite3 for SQLite database access
 * Runs in Electron main process
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Get the path to the app's user data directory
 * On macOS: ~/Library/Application Support/ai-video-editing/
 */
function getAppDataPath() {
  const userDataPath = app.getPath('userData');
  return join(userDataPath, 'ai-video-editing');
}

/**
 * Get the path to the database file
 */
function getDatabasePath() {
  const appDataPath = getAppDataPath();
  return join(appDataPath, 'database.db');
}

/**
 * Initialize the database
 * Creates the app data directory if it doesn't exist, then creates/opens the database
 */
export function initializeDatabase() {
  if (db) {
    return db;
  }

  // Ensure app data directory exists
  const appDataPath = getAppDataPath();
  if (!existsSync(appDataPath)) {
    mkdirSync(appDataPath, { recursive: true });
  }

  // Open database connection
  const dbPath = getDatabasePath();
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run schema migrations
  runMigrations();

  return db;
}

/**
 * Run database migrations (create tables + add new columns for existing DBs)
 */
function runMigrations() {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Read schema file
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute schema (SQLite supports multiple statements)
  db.exec(schema);

  // Add clip_name to media if missing (for existing databases)
  const hasClipName = db.prepare(
    "SELECT 1 FROM pragma_table_info('media') WHERE name = 'clip_name'"
  ).get();
  if (!hasClipName) {
    db.exec('ALTER TABLE media ADD COLUMN clip_name TEXT');
  }

  // Add thumbnail_path to media if missing (for existing databases)
  const hasThumbnailPath = db.prepare(
    "SELECT 1 FROM pragma_table_info('media') WHERE name = 'thumbnail_path'"
  ).get();
  if (!hasThumbnailPath) {
    db.exec('ALTER TABLE media ADD COLUMN thumbnail_path TEXT');
  }
}

/**
 * Get the database instance
 * Call initializeDatabase() first if you haven't already
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
