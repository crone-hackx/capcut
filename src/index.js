// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://worldoftech.qzz.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.DB) {
      return errorResponse('Database not configured', 500, corsHeaders);
    }

    try {
      // GET /api/comments
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, username, text, likes, created_at FROM comments ORDER BY created_at DESC LIMIT 50'
        ).all();
        return jsonResponse({ comments: results }, corsHeaders);
      }

      // POST /api/comments
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        const body = await readJson(request);
        const { username, text } = body || {};

        if (!username || typeof username !== 'string' || username.length < 2 || username.length > 20) {
          return errorResponse('Username must be 2–20 characters', 400, corsHeaders);
        }
        if (!text || typeof text !== 'string' || text.length < 5 || text.length > 500) {
          return errorResponse('Comment must be 5–500 characters', 400, corsHeaders);
        }

        const cleanUsername = username.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const cleanText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();

        if (cleanUsername.length < 2) {
          return errorResponse('Invalid username characters', 400, corsHeaders);
        }

        // ✅ This will now work with correct D1 schema
        const insert = await env.DB.prepare(
          'INSERT INTO comments (username, text) VALUES (?, ?)'
        ).bind(cleanUsername, cleanText).run();

        if (!insert.success) {
          return errorResponse('Failed to save comment', 500, corsHeaders);
        }

        const newComment = {
          id: insert.meta.last_row_id,
          username: cleanUsername,
          text: cleanText,
          likes: 0,
          created_at: new Date().toISOString()
        };

        return jsonResponse({ success: true, comment: newComment }, corsHeaders);
      }

      // POST /api/comments/like
      if (url.pathname === '/api/comments/like' && request.method === 'POST') {
        const body = await readJson(request);
        const commentId = body?.commentId;

        if (!Number.isInteger(commentId) || commentId <= 0) {
          return errorResponse('Invalid comment ID', 400, corsHeaders);
        }

        const clientId = await getClientId(request);
        if (!clientId) {
          return errorResponse('Client ID unavailable', 400, corsHeaders);
        }

        // Prevent duplicate likes
        const existing = await env.DB.prepare(
          'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_identifier = ?'
        ).bind(commentId, clientId).first();

        if (existing) {
          return errorResponse('Already liked', 400, corsHeaders);
        }

        // Record like
        await env.DB.prepare(
          'INSERT INTO comment_likes (comment_id, user_identifier) VALUES (?, ?)'
        ).bind(commentId, clientId).run();

        // Update count
        await env.DB.prepare(
          'UPDATE comments SET likes = likes + 1 WHERE id = ?'
        ).bind(commentId).run();

        const { results } = await env.DB.prepare(
          'SELECT likes FROM comments WHERE id = ?'
        ).bind(commentId).all();

        const likes = results[0]?.likes || 0;
        return jsonResponse({ success: true, likes }, corsHeaders);
      }

      return errorResponse('Not Found', 404, corsHeaders);

    } catch (err) {
      console.error('Worker error:', err.message, err.stack);
      return errorResponse('Internal Server Error', 500, corsHeaders);
    }
  },

  // ✅ Daily auto-like cron
  async scheduled(event, env, ctx) {
    try {
      const { results } = await env.DB.prepare('SELECT id FROM comments').all();
      
      if (!results || results.length === 0) {
        console.log('No comments to auto-like');
        return;
      }

      for (const row of results) {
        const randomLikes = Math.floor(Math.random() * 1001) + 500; // 500–1500
        await env.DB.prepare(
          'UPDATE comments SET likes = likes + ? WHERE id = ?'
        ).bind(randomLikes, row.id).run();
      }

      console.log(`✅ Auto-likes applied to ${results.length} comments`);
    } catch (err) {
      console.error('Auto-like cron failed:', err);
    }
  }
};

// ===== Helpers =====

async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid JSON');
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
