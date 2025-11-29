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
      return errorResponse("D1 binding 'DB' is not configured", 500, corsHeaders);
    }

    try {
      // Ensure table exists on every request (lightweight)
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          likes INTEGER DEFAULT 0
        )
      `).run();

      // GET comments
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, username, text, likes FROM comments ORDER BY id DESC LIMIT 50'
        ).all();
        return jsonResponse({ comments: results || [] }, corsHeaders);
      }

      // POST comment
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return errorResponse("Invalid JSON", 400, corsHeaders);
        }

        const { username, text } = body;

        if (!username || typeof username !== 'string' || username.trim().length < 2) {
          return errorResponse("Username must be 2–20 characters", 400, corsHeaders);
        }
        if (!text || typeof text !== 'string' || text.trim().length < 5) {
          return errorResponse("Comment must be 5–500 characters", 400, corsHeaders);
        }

        const cleanUsername = username.trim().substring(0, 20);
        const cleanText = text.trim().substring(0, 500);

        const insert = await env.DB.prepare(
          'INSERT INTO comments (username, text, likes) VALUES (?, ?, 0)'
        ).bind(cleanUsername, cleanText).run();

        if (!insert.success) {
          return errorResponse("Failed to save comment", 500, corsHeaders);
        }

        return jsonResponse({ success: true, id: insert.meta.last_row_id }, corsHeaders);
      }

      return errorResponse("Not Found", 404, corsHeaders);

    } catch (err) {
      console.error("Worker error:", err.message, err.stack);
      return errorResponse("Internal Server Error", 500, corsHeaders);
    }
  }
};

// Helper functions
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
