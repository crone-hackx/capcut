-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL CHECK (length(username) >= 2 AND length(username) <= 20),
  text TEXT NOT NULL CHECK (length(text) >= 5 AND length(text) <= 500),
  likes INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Likes tracking (to prevent duplicate likes)
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id INTEGER NOT NULL,
  user_identifier TEXT NOT NULL, -- IP or session
  liked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_identifier),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Optional: Download stats
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_downloads INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO stats (id, total_downloads) VALUES (1, 0);
