-- Ensure comments table exists (from before)
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  likes INTEGER DEFAULT 0
);

-- NEW: Track user likes (prevent duplicates)
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id INTEGER NOT NULL,
  user_identifier TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_identifier),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
