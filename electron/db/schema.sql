-- SQLite Database Schema for AI Video Editing MVP
-- Stores: Projects → Media → Transcripts → Selects

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  context TEXT, -- JSON array of chat messages: [{"role": "user", "content": "..."}, ...]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Media table
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  file_path TEXT NOT NULL, -- Absolute path to original video file
  storage_type TEXT DEFAULT 'local', -- 'local' or 'cloud' (for future cloud support)
  storage_provider TEXT, -- NULL for local, or 'dropbox', 'googledrive', etc. (for future)
  proxy_path TEXT, -- Path to proxy/transcoded file for editing
  camera_audio_path TEXT, -- Extracted camera scratch audio
  master_audio_path TEXT, -- External master audio file (nullable)
  audio_sync_offset REAL, -- Offset in seconds for master audio sync (nullable)
  duration REAL, -- Video duration in seconds
  width INTEGER, -- Video width in pixels
  height INTEGER, -- Video height in pixels
  clip_name TEXT, -- User-editable display name for the clip
  thumbnail_path TEXT, -- Path to extracted frame thumbnail (JPEG)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL,
  text TEXT NOT NULL, -- Full transcript text
  words TEXT NOT NULL, -- JSON blob: [{"word": "hello", "start": 0.5, "end": 0.8}, ...]
  empty_reason TEXT, -- NULL = has content; 'no_audio' = no audio/extract failed; 'transcription_failed' = Whisper failed or no speech
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

-- Selects table
CREATE TABLE IF NOT EXISTS selects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcript_id INTEGER NOT NULL,
  start_time REAL NOT NULL, -- Start time in seconds
  end_time REAL NOT NULL, -- End time in seconds
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'adjusted'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_project_id ON media(project_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_media_id ON transcripts(media_id);
CREATE INDEX IF NOT EXISTS idx_selects_transcript_id ON selects(transcript_id);
CREATE INDEX IF NOT EXISTS idx_selects_status ON selects(status);
