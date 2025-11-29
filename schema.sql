CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL CHECK (length(username) >= 2 AND length(username) <= 20),
  text TEXT NOT NULL CHECK (length(text) >= 5 AND length(text) <= 500),
  likes INTEGER DEFAULT 0,
  created_at TEXT NOT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id INTEGER NOT NULL,
  user_identifier TEXT NOT NULL,
  liked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_identifier),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
