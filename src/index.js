// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://worldoftech.qzz.io/capcut', // 🔒 Replace with your domain in production
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route API
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        return handleGetComments(env.DB, corsHeaders);
      }
      
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        return handlePostComment(request, env.DB, corsHeaders, getClientId(request));
      }
      
      if (url.pathname === '/api/comments/like' && request.method === 'POST') {
        return handleLikeComment(request, env.DB, corsHeaders, getClientId(request));
      }
      
      if (url.pathname === '/api/download-count' && request.method === 'POST') {
        return handleDownloadCount(env.DB, corsHeaders);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Server error:', err);
      return new Response('Internal Error', { status: 500, headers: corsHeaders });
    }
  }
};

// ===== Handlers =====

async function handleGetComments(db, headers) {
  const { results } = await db.prepare(
    'SELECT id, username, text, likes, created_at FROM comments ORDER BY created_at DESC LIMIT 50'
  ).all();
  
  // Add liked:false by default (frontend will update if user liked)
  const comments = results.map(row => ({
    ...row,
    liked: false
  }));
  
  return new Response(JSON.stringify({ comments }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handlePostComment(request, db, headers, clientId) {
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'Client ID required' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  const body = await request.json();
  const { username, text } = body;

  // Validation
  if (!username || username.length < 2 || username.length > 20) {
    return new Response(JSON.stringify({ error: 'Invalid username' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }
  if (!text || text.length < 5 || text.length > 500) {
    return new Response(JSON.stringify({ error: 'Invalid comment' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  // Sanitize (basic)
  const cleanUsername = username.replace(/[^a-zA-Z0-9_\- ]/g, '');
  const cleanText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Insert
  const insert = await db.prepare(
    'INSERT INTO comments (username, text) VALUES (?, ?)'
  ).bind(cleanUsername, cleanText).run();

  if (!insert.success) {
    return new Response(JSON.stringify({ error: 'Failed to post' }), { 
      status: 500, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  const newComment = {
    id: insert.meta.last_row_id,
    username: cleanUsername,
    text: cleanText,
    likes: 0,
    created_at: new Date().toISOString(),
    liked: false
  };

  return new Response(JSON.stringify({ success: true, comment: newComment }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handleLikeComment(request, db, headers, clientId) {
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'Client ID required' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  const body = await request.json();
  const { commentId } = body;

  if (!commentId || typeof commentId !== 'number') {
    return new Response(JSON.stringify({ error: 'Invalid comment ID' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  // Check if already liked
  const existing = await db.prepare(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_identifier = ?'
  ).bind(commentId, clientId).first();

  if (existing) {
    return new Response(JSON.stringify({ error: 'Already liked' }), { 
      status: 400, 
      headers: { ...headers, 'Content-Type': 'application/json' } 
    });
  }

  // Add like
  await db.prepare(
    'INSERT INTO comment_likes (comment_id, user_identifier) VALUES (?, ?)'
  ).bind(commentId, clientId).run();

  // Increment likes count
  await db.prepare(
    'UPDATE comments SET likes = likes + 1 WHERE id = ?'
  ).bind(commentId).run();

  // Get new count
  const { results } = await db.prepare(
    'SELECT likes FROM comments WHERE id = ?'
  ).bind(commentId).all();

  const likes = results[0]?.likes || 0;

  return new Response(JSON.stringify({ success: true, likes }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handleDownloadCount(db, headers) {
  // Optional: track downloads
  await db.prepare(
    'UPDATE stats SET total_downloads = total_downloads + 1 WHERE id = 1'
  ).run();

  const { results } = await db.prepare(
    'SELECT total_downloads FROM stats WHERE id = 1'
  ).all();

  const count = results[0]?.total_downloads || 0;

  return new Response(JSON.stringify({ count }), {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ===== Utils =====

function getClientId(request) {
  // Use CF-Connecting-IP + User-Agent as pseudo ID (not perfect, but works without auth)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  // Hash to avoid PII
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + ua);
  const hash = new Uint8Array(16);
  crypto.getRandomValues(hash); // Simple obfuscation (not crypto-safe)
  return btoa(String.fromCharCode(...hash)).substring(0, 16);
}
