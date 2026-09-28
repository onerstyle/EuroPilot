#!/usr/bin/env node
// EuroPilot Famille — Serveur preview (Node, même logique que worker.js)
// Pour rendre le Worker fonctionnel immédiatement sans compte Cloudflare :
//  - écoute sur 0.0.0.0:8787
//  - l'URL preview https://8787-....e2b.app sert d'endpoint Famille
//  - persistance mémoire (volatile) — pour la prod, déploie sur Cloudflare via WORKER_SETUP.md

import http from 'node:http';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const MEM = new Map();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, Prefer, X-Client-Info',
  'Access-Control-Max-Age': '86400',
};

function cors(extra = {}) {
  return { ...CORS, ...extra };
}

function getPathCode(urlStr) {
  try {
    const u = new URL(urlStr, 'http://localhost');
    const p = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.json$/, '');
    if (!p || p === 'health' || p.startsWith('rest/')) return null;
    if (p.startsWith('family/')) return decodeURIComponent(p.slice(7).replace(/\.json$/, '')).toUpperCase();
    if (/^EURO-[A-Z0-9]{4}$/i.test(p)) return p.toUpperCase();
    const seg = p.split('/').pop().replace(/\.json$/, '');
    if (/^EURO-[A-Z0-9]{4}$/i.test(seg)) return seg.toUpperCase();
    return decodeURIComponent(seg).toUpperCase();
  } catch { return null; }
}

async function readBody(req) {
  return new Promise((res) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => res(d));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const set = (h) => Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
  set(cors());

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (url.pathname === '/health' || url.pathname === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
    return res.end(JSON.stringify({ ok: true, mode: 'memory-preview', time: new Date().toISOString(), storeSize: MEM.size }));
  }

  if (url.pathname === '/' || url.pathname === '') {
    const origin = `http://${req.headers.host}`;
    // On essaie de deviner l'URL preview https
    const host = req.headers.host || `localhost:${PORT}`;
    const isPreview = host.includes('e2b.app');
    const previewOrigin = isPreview ? `https://${host}` : origin;
    const html = `<!doctype html><meta charset="utf-8"><title>EuroPilot Famille Worker (preview)</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}pre{background:#f3f4f6;padding:12px;border-radius:12px;overflow:auto}</style>
<h1>EuroPilot Famille — Worker Preview OK</h1>
<p>Mode: <b>mémoire preview</b> (volatile, pour tester immédiatement). Pour la prod, déploie sur Cloudflare : voir <code>WORKER_SETUP.md</code>.</p>
<p>Endpoint à coller dans EuroPilot (F12 console) :</p>
<pre>localStorage.setItem('europilot.family.endpoint','${previewOrigin}');
localStorage.removeItem('europilot.family.key');
location.reload();</pre>
<p>Puis <i>Paramètres → Synchronisation Famille</i> → <code>EURO-XXXX</code> → <b>Envoyer</b>.</p>
<p>Santé: <a href="/health">/health</a> — Store: ${MEM.size} salon(s)</p>
<hr><p style="color:#6b7280;font-size:13px">Données chiffrées côté client (AES-GCM). Le serveur ne voit que du base64.</p>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors() });
    return res.end(html);
  }

  const isSupabasePath = url.pathname.startsWith('/rest/v1/family');

  if (isSupabasePath) {
    if (req.method === 'GET') {
      const eq = url.searchParams.get('code');
      let code = null;
      if (eq && eq.startsWith('eq.')) code = decodeURIComponent(eq.slice(3)).toUpperCase();
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
        return res.end(JSON.stringify({ error: 'code manquant (ex: ?code=eq.EURO-XXXX)' }));
      }
      const data = MEM.get(code) || null;
      if (!data) {
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
        return res.end(JSON.stringify([]));
      }
      const updatedAt = MEM.get(`${code}:updatedAt`) || null;
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify([{ code, data, updated_at: updatedAt, updatedAt }]));
    }
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
      const body = await readBody(req);
      let j = null;
      try { j = JSON.parse(body); } catch {}
      let code = null, data = null, updatedAt = null;
      if (j && j.code && j.data) {
        code = String(j.code).toUpperCase();
        data = String(j.data);
        updatedAt = j.updated_at || j.updatedAt || null;
      } else {
        const eq = url.searchParams.get('code');
        if (eq && eq.startsWith('eq.')) code = decodeURIComponent(eq.slice(3)).toUpperCase();
        data = body.trim();
      }
      if (!code || !data) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
        return res.end(JSON.stringify({ error: 'code et data requis' }));
      }
      MEM.set(code, data);
      if (updatedAt) MEM.set(`${code}:updatedAt`, updatedAt);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify([{ code, data, updated_at: updatedAt }]));
    }
    res.writeHead(405, { 'Content-Type': 'application/json', ...cors() });
    return res.end(JSON.stringify({ error: 'méthode non supportée' }));
  }

  // Routes génériques /EURO-XXXX
  const pathCode = getPathCode(req.url);

  if (req.method === 'GET') {
    if (!pathCode) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify({ error: 'code manquant (ex: /EURO-AB12)' }));
    }
    const data = MEM.get(pathCode.toUpperCase());
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...cors() });
      return res.end('');
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...cors() });
    return res.end(data);
  }

  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const body = await readBody(req);
    let data = body.trim();
    let code = pathCode;
    // Si body est JSON {data, code}
    try {
      const j = JSON.parse(body);
      if (j && j.data) {
        data = String(j.data);
        if (j.code) code = String(j.code);
      }
    } catch {}
    if (!code || !data) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify({ error: 'code et body (base64) requis' }));
    }
    code = code.toUpperCase();
    if (!/^EURO-[A-Z0-9]{4}$/i.test(code)) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify({ error: 'code invalide' }));
    }
    MEM.set(code, data);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
    return res.end(JSON.stringify({ ok: true, code }));
  }

  if (req.method === 'DELETE') {
    if (!pathCode) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...cors() });
      return res.end(JSON.stringify({ error: 'code manquant' }));
    }
    MEM.delete(pathCode.toUpperCase());
    MEM.delete(`${pathCode.toUpperCase()}:updatedAt`);
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors() });
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...cors() });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[family-preview] listening on 0.0.0.0:${PORT} — GET /health`);
});
