// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers (applied to ALL responses)
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://worldoftech.qzz.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight (must be first)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Safety: Ensure D1 binding exists
    if (!env.DB) {
      return errorResponse('Database not configured', 500, corsHeaders);
    }

    try {
      // Route: Get comments
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, username, text, likes, created_at FROM comments ORDER BY created_at DESC LIMIT 50'
        ).all();
        return jsonResponse({ comments: results }, corsHeaders);
      }

      // Route: Post comment
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        const body = await readJson(request);
        const { username, text } = body || {};

        // Validation
        if (!username || typeof username !== 'string' || username.length < 2 || username.length > 20) {
          return errorResponse('Invalid username (2-20 chars)', 400, corsHeaders);
        }
        if (!text || typeof text !== 'string' || text.length < 5 || text.length > 500) {
          return errorResponse('Invalid comment (5-500 chars)', 400, corsHeaders);
        }

        // Sanitize (basic)
        const cleanUsername = username.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const cleanText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();

        if (cleanUsername.length < 2) {
          return errorResponse('Username contains invalid characters', 400, corsHeaders);
        }

        // Insert
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

      // Route: Like comment
      if (url.pathname === '/api/comments/like' && request.method === 'POST') {
        const body = await readJson(request);
        const commentId = body?.commentId;

        if (!Number.isInteger(commentId) || commentId <= 0) {
          return errorResponse('Invalid comment ID', 400, corsHeaders);
        }

        // Get client identifier (IP-based)
        const clientId = getClientId(request);
        if (!clientId) {
          return errorResponse('Client ID unavailable', 400, corsHeaders);
        }

        // Check if already liked
        const existing = await env.DB.prepare(
          'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_identifier = ?'
        ).bind(commentId, clientId).first();

        if (existing) {
          return errorResponse('Already liked', 400, corsHeaders);
        }

        // Add like record
        await env.DB.prepare(
          'INSERT INTO comment_likes (comment_id, user_identifier) VALUES (?, ?)'
        ).bind(commentId, clientId).run();

        // Update likes count
        await env.DB.prepare(
          'UPDATE comments SET likes = likes + 1 WHERE id = ?'
        ).bind(commentId).run();

        // Fetch new count
        const { results } = await env.DB.prepare(
          'SELECT likes FROM comments WHERE id = ?'
        ).bind(commentId).all();

        const likes = results[0]?.likes || 0;
        return jsonResponse({ success: true, likes }, corsHeaders);
      }

      // Route: (Optional) Track download
      if (url.pathname === '/api/download-count' && request.method === 'POST') {
        // Optional: Implement if needed
        return jsonResponse({ count: 0 }, corsHeaders);
      }

      // 404 for unknown routes
      return errorResponse('Not Found', 404, corsHeaders);

    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Internal Server Error', 500, corsHeaders);
    }
  }
};

// ===== Helper Functions =====

async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error('Invalid JSON');
  }
}

function getClientId(request) {
  // Use CF-Connecting-IP if available (paid plans), fallback to hashed UA
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  
  // Create a simple hash (not cryptographic, but sufficient for deduplication)
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + ua);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray)).substring(0, 24);
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
