// Voice of Piece — Worker
// Serves the static site from ./public, plus:
//   GET /api/artists/:slug/artworks  published artworks from D1 (JSON)
//   GET /photos/<r2_key>             artwork photos from R2
//   /api/studio/*                    admin studio (see studio.js)

import { handleStudio } from './studio.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

// Subdomains: ezekiel.voiceofpiece.org shows /public/ezekiel/, etc.
// To add an artist later, add the folder name here and a route in wrangler.jsonc.
const MAIN_HOST = 'voiceofpiece.org';
const ARTIST_SUBDOMAINS = [
  'aggrey',
  'alto',
  'elichilia',
  'evarist',
  'evodius',
  'ezekiel',
  'godwin',
  'hedwiga',
  'james',
  'john',
  'kipara',
  'ladislaus',
  'lutengano',
  'mitole',
  'paul',
  'price',
  'simon',
  'artbridge'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;

    // www.voiceofpiece.org -> voiceofpiece.org
    if (host === 'www.' + MAIN_HOST) {
      url.hostname = MAIN_HOST;
      return Response.redirect(url.toString(), 301);
    }

    // voiceofpiece.org/ezekiel/... -> ezekiel.voiceofpiece.org/...
    if (host === MAIN_HOST) {
      const m = url.pathname.match(/^\/([a-z0-9-]+)(\/.*)?$/);
      if (m && ARTIST_SUBDOMAINS.includes(m[1])) {
        return Response.redirect(`https://${m[1]}.${MAIN_HOST}${m[2] || '/'}${url.search}`, 301);
      }
    }

    try {
      if (url.pathname.startsWith('/api/studio/')) return await handleStudio(request, url, env);
      if (url.pathname.startsWith('/api/')) return await handleApi(url, env);
      if (url.pathname.startsWith('/photos/')) return await handlePhoto(request, url, env, ctx);
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
    }

    const sub = host.endsWith('.' + MAIN_HOST) ? host.slice(0, -(MAIN_HOST.length + 1)) : null;
    if (sub && ARTIST_SUBDOMAINS.includes(sub)) return serveArtist(request, url, env, sub);

    return env.ASSETS.fetch(request);
  },
};

// On an artist subdomain, look in that artist's folder first.
// If the file isn't there (shared CSS, /studio/, etc.), serve it from the site root.
async function serveArtist(request, url, env, artist) {
  // Artist pages are read-only; reject POST etc. so the request body is never reused.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const prefix = '/' + artist;
  const inner = new URL(url);
  inner.pathname = prefix + url.pathname;

  const res = await env.ASSETS.fetch(new Request(inner, request));
  if (res.status === 404) return env.ASSETS.fetch(request);

  // Keep redirects (e.g. adding a trailing slash) on the short subdomain path.
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) {
      const target = new URL(loc, inner);
      if (target.pathname.startsWith(prefix + '/')) {
        const headers = new Headers(res.headers);
        headers.set('location', target.pathname.slice(prefix.length) + target.search);
        return new Response(null, { status: res.status, headers });
      }
    }
  }
  return res;
}

async function handleApi(url, env) {
  const m = url.pathname.match(/^\/api\/artists\/([a-z0-9-]+)\/artworks\/?$/);
  if (!m) return json({ error: 'Not found' }, 404);
  const slug = m[1];

  const artist = await env.DB.prepare(
    'SELECT id, slug, code, name FROM artists WHERE slug = ?1 AND is_active = 1'
  ).bind(slug).first();
  if (!artist) return json({ error: 'Artist not found' }, 404);

  const [works, texts, images] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, catalogue_no, year, width, height, unit, place, signed, framed, exhibited, shop_url
         FROM artworks WHERE artist_id = ?1 AND status = 'published'
        ORDER BY sort_order, id`
    ).bind(artist.id),
    env.DB.prepare(
      `SELECT t.artwork_id, t.lang, t.title, t.medium, t.artist_words, t.description
         FROM artwork_texts t JOIN artworks a ON a.id = t.artwork_id
        WHERE a.artist_id = ?1 AND a.status = 'published'`
    ).bind(artist.id),
    env.DB.prepare(
      `SELECT i.artwork_id, i.r2_key, i.image_type, i.sort_order, i.width, i.height, i.source_path
         FROM artwork_images i JOIN artworks a ON a.id = i.artwork_id
        WHERE a.artist_id = ?1 AND a.status = 'published'
        ORDER BY i.artwork_id, (i.image_type = 'main') DESC, i.sort_order, i.id`
    ).bind(artist.id),
  ]);

  const byId = new Map();
  for (const w of works.results) {
    byId.set(w.id, {
      catalogue_no: w.catalogue_no, year: w.year, width: w.width, height: w.height, unit: w.unit,
      place: w.place, signed: w.signed, framed: w.framed, exhibited: w.exhibited, shop_url: w.shop_url,
      texts: {}, images: [],
    });
  }
  for (const t of texts.results) {
    const w = byId.get(t.artwork_id);
    if (w) w.texts[t.lang] = { title: t.title, medium: t.medium, artist_words: t.artist_words, description: t.description };
  }
  for (const i of images.results) {
    const w = byId.get(i.artwork_id);
    if (w) w.images.push({
      url: '/photos/' + i.r2_key.split('/').map(encodeURIComponent).join('/'),
      type: i.image_type, width: i.width, height: i.height, source_path: i.source_path,
    });
  }

  return json(
    { artist: { slug: artist.slug, code: artist.code, name: artist.name }, artworks: [...byId.values()] },
    200,
    { 'cache-control': 'public, max-age=60' }
  );
}

async function handlePhoto(request, url, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const key = decodeURIComponent(url.pathname.slice('/photos/'.length));
  if (!key.startsWith('artists/') || key.includes('..')) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=86400');
  if (!headers.get('content-type')) headers.set('content-type', contentType(key));

  const res = new Response(obj.body, { headers });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

function contentType(key) {
  const ext = key.split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream';
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}
