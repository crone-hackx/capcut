// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://worldoftech.qzz.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.DB) {
      return errorResponse("D1 binding 'DB' not configured", 500, corsHeaders);
    }

    try {
      // Ensure tables exist
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          likes INTEGER DEFAULT 0
        )
      `).run();

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS comment_likes (
          comment_id INTEGER NOT NULL,
          user_identifier TEXT NOT NULL,
          PRIMARY KEY (comment_id, user_identifier),
          FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
        )
      `).run();

      // GET comments with relative timestamps
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, username, text, likes FROM comments ORDER BY id DESC LIMIT 50'
        ).all();

        // Add human-readable "timeAgo" (frontend can also do this, but we include created_at)
        const comments = (results || []).map(row => ({
          ...row,
          created_at: new Date().toISOString(), // Since we don’t store timestamp, use now
          time_ago: "Just now"
        }));

        return jsonResponse({ comments }, corsHeaders);
      }

      // POST comment
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        const body = await readJson(request);
        const { username, text } = body || {};

        if (!username || username.trim().length < 2) {
          return errorResponse("Username must be 2+ chars", 400, corsHeaders);
        }
        if (!text || text.trim().length < 5) {
          return errorResponse("Comment must be 5+ chars", 400, corsHeaders);
        }

        const cleanUsername = username.trim().substring(0, 20);
        const cleanText = text.trim().substring(0, 500);

        const insert = await env.DB.prepare(
          'INSERT INTO comments (username, text, likes) VALUES (?, ?, 0)'
        ).bind(cleanUsername, cleanText).run();

        if (!insert.success) {
          return errorResponse("Failed to save", 500, corsHeaders);
        }

        return jsonResponse({ success: true, id: insert.meta.last_row_id }, corsHeaders);
      }

      // POST like
      if (url.pathname === '/api/comments/like' && request.method === 'POST') {
        const body = await readJson(request);
        const commentId = body?.commentId;

        if (!Number.isInteger(commentId) || commentId <= 0) {
          return errorResponse("Invalid comment ID", 400, corsHeaders);
        }

        // Generate user identifier (IP + UA hash)
        const clientId = await getClientId(request);
        if (!clientId) {
          return errorResponse("Client ID unavailable", 400, corsHeaders);
        }

        // Check if already liked
        const existing = await env.DB.prepare(
          'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_identifier = ?'
        ).bind(commentId, clientId).first();

        if (existing) {
          return errorResponse("Already liked", 400, corsHeaders);
        }

        // Record like
        await env.DB.prepare(
          'INSERT INTO comment_likes (comment_id, user_identifier) VALUES (?, ?)'
        ).bind(commentId, clientId).run();

        // Update likes count
        await env.DB.prepare(
          'UPDATE comments SET likes = likes + 1 WHERE id = ?'
        ).bind(commentId).run();

        // Return new count
        const { results } = await env.DB.prepare(
          'SELECT likes FROM comments WHERE id = ?'
        ).bind(commentId).all();

        const likes = results[0]?.likes || 0;
        return jsonResponse({ success: true, likes }, corsHeaders);
      }

      return errorResponse("Not Found", 404, corsHeaders);

    } catch (err) {
      console.error("Worker error:", err.message);
      return errorResponse("Internal Server Error", 500, corsHeaders);
    }
  },

  // ✅ Scheduled auto-like every 72 hours
  async scheduled(event, env, ctx) {
    try {
      const { results } = await env.DB.prepare('SELECT id FROM comments').all();
      if (!results || results.length === 0) return;

      for (const row of results) {
        const randomLikes = Math.floor(Math.random() * 951) + 50; // 50 to 1000
        await env.DB.prepare(
          'UPDATE comments SET likes = likes + ? WHERE id = ?'
        ).bind(randomLikes, row.id).run();
      }

      console.log(`✅ Auto-likes: added to ${results.length} comments`);
    } catch (err) {
      console.error("Auto-like cron failed:", err);
    }
  }
};

// ===== Helpers =====
async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid JSON");
  }
}

async function getClientId(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  const data = new TextEncoder().encode(ip + ua);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).substring(0, 24);
}

function jsonResponse(data, headers) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function errorResponse(message, status, headers) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
