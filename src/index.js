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

    // Safety: if DB is missing, return clear error
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "DB binding missing" }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      // GET comments
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, username, text, likes, created_at FROM comments ORDER BY id DESC LIMIT 20'
        ).all();
        return new Response(JSON.stringify({ comments: results }), {
          headers: { ...cors_headers, 'Content-Type': 'application/json' }
        });
      }

      // POST comment
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        const { username, text } = await request.json();

        // Basic validation
        if (!username || username.length < 2) {
          return new Response(JSON.stringify({ error: "Username too short" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (!text || text.length < 5) {
          return new Response(JSON.stringify({ error: "Comment too short" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Insert — Only these 2 fields required
        const result = await env.DB.prepare(
          'INSERT INTO comments (username, text) VALUES (?, ?)'
        ).bind(username, text).run();

        return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
