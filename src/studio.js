// Voice of Piece — admin studio API (/api/studio/*)
// Login: admin password stored as the Worker secret ADMIN_PASSWORD.
// Sessions: random token in an HttpOnly cookie; only its SHA-256 hash is stored in D1.

const COOKIE = 'vop_session';
const SESSION_DAYS = 7;
const JSONH = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const now = "datetime('now')";

export async function handleStudio(request, url, env) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // Every write must be same-site JSON/form with our header (blocks cross-site forms).
  if (method !== 'GET' && request.headers.get('x-vop') !== '1') return err('Bad request', 400);

  if (path === '/api/studio/login' && method === 'POST') return login(request, env);
  if (path === '/api/studio/logout' && method === 'POST') return logout(request, env);

  const admin = await currentAdmin(request, env);
  if (!admin) return err('Not signed in', 401);

  if (path === '/api/studio/me' && method === 'GET') return ok({ email: admin });
  if (path === '/api/studio/artists' && method === 'GET') return listArtists(env);
  if (path === '/api/studio/polish' && method === 'POST') return polish(request, env);
  if (path === '/api/studio/translate-all' && method === 'POST') return translateAll(request, env);

  let m;
  if ((m = path.match(/^\/api\/studio\/artists\/([a-z0-9-]+)\/artworks$/))) {
    if (method === 'GET') return listArtworks(env, m[1]);
    if (method === 'POST') return createArtwork(request, env, m[1], admin);
  }
  if ((m = path.match(/^\/api\/studio\/artworks\/(VOP-[A-Z]+-\d+)$/)) && method === 'PUT')
    return updateArtwork(request, env, m[1], admin);
  if ((m = path.match(/^\/api\/studio\/artworks\/(VOP-[A-Z]+-\d+)\/photo$/)) && method === 'POST')
    return replacePhoto(request, env, m[1], admin);
  if ((m = path.match(/^\/api\/studio\/artworks\/(VOP-[A-Z]+-\d+)\/status$/)) && method === 'POST')
    return setStatus(request, env, m[1], admin);

  return err('Not found', 404);
}

/* ---------------- auth ---------------- */

async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return err('Admin password is not set on the server.', 500);
  let body; try { body = await request.json(); } catch { return err('Bad request', 400); }
  const pw = String(body.password || '');
  if (!(await safeEqual(pw, env.ADMIN_PASSWORD))) {
    await new Promise(r => setTimeout(r, 800));            // slow down guessing
    return err('Wrong password', 401);
  }
  const adminRow = await env.DB.prepare('SELECT email FROM admins ORDER BY created_at LIMIT 1').first();
  if (!adminRow) return err('No admin configured', 500);
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ${now}`),
    env.DB.prepare(`INSERT INTO sessions (token_hash, admin_email, expires_at, last_seen_at)
                    VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'), ${now})`)
      .bind(await sha256(token), adminRow.email),
  ]);
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
  return new Response(JSON.stringify({ email: adminRow.email }), { headers: { ...JSONH, 'set-cookie': cookie } });
}

async function logout(request, env) {
  const t = readCookie(request);
  if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(t)).run();
  return new Response('{}', { headers: { ...JSONH, 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
}

async function currentAdmin(request, env) {
  const t = readCookie(request);
  if (!t) return null;
  const row = await env.DB.prepare(
    `SELECT admin_email FROM sessions WHERE token_hash = ?1 AND admin_email IS NOT NULL AND expires_at > ${now}`
  ).bind(await sha256(t)).first();
  return row ? row.admin_email : null;
}

/* ---------------- reads ---------------- */

async function listArtists(env) {
  const r = await env.DB.prepare(
    `SELECT x.slug, x.code, x.name, x.sort_order,
            (SELECT count(*) FROM artworks a WHERE a.artist_id = x.id) AS works,
            (SELECT count(*) FROM artwork_input_missing m WHERE m.artist_id = x.id
               AND (m.missing_title + m.missing_year + m.missing_size + m.missing_medium + m.missing_place + m.missing_main_photo) > 0) AS incomplete
       FROM artists x WHERE x.is_active = 1 ORDER BY x.sort_order`
  ).all();
  return ok({ artists: r.results });
}

async function listArtworks(env, slug) {
  const artist = await env.DB.prepare('SELECT id, slug, code, name FROM artists WHERE slug = ?1').bind(slug).first();
  if (!artist) return err('Artist not found', 404);
  const [works, texts, images, missing] = await env.DB.batch([
    env.DB.prepare(`SELECT id, catalogue_no, year, width, height, unit, place, signed, framed, exhibited, shop_url, status, sort_order, updated_at
                      FROM artworks WHERE artist_id = ?1 ORDER BY sort_order, id`).bind(artist.id),
    env.DB.prepare(`SELECT t.artwork_id, t.lang, t.title, t.medium, t.artist_words, t.description
                      FROM artwork_texts t JOIN artworks a ON a.id = t.artwork_id WHERE a.artist_id = ?1`).bind(artist.id),
    env.DB.prepare(`SELECT i.artwork_id, i.r2_key, i.width, i.height FROM artwork_images i JOIN artworks a ON a.id = i.artwork_id
                     WHERE a.artist_id = ?1 AND i.image_type = 'main'`).bind(artist.id),
    env.DB.prepare(`SELECT * FROM artwork_input_missing WHERE artist_id = ?1`).bind(artist.id),
  ]);
  const byId = new Map();
  for (const w of works.results) byId.set(w.id, { ...w, texts: {}, photo: null, missing: {} });
  for (const t of texts.results) { const w = byId.get(t.artwork_id); if (w) w.texts[t.lang] = t; }
  for (const i of images.results) { const w = byId.get(i.artwork_id); if (w) w.photo = { url: photoUrl(i.r2_key), width: i.width, height: i.height }; }
  for (const m of missing.results) {
    const w = byId.get(m.artwork_id);
    if (w) w.missing = { title: !!m.missing_title, year: !!m.missing_year, size: !!m.missing_size, medium: !!m.missing_medium, place: !!m.missing_place, photo: !!m.missing_main_photo };
  }
  const list = [...byId.values()].map(w => { delete w.id; return w; });
  return ok({ artist: { slug: artist.slug, code: artist.code, name: artist.name }, artworks: list });
}

/* ---------------- writes ---------------- */

const FIELDS = ['year', 'width', 'height', 'unit', 'place', 'signed', 'framed', 'exhibited', 'shop_url'];
const TEXT_FIELDS = ['title', 'medium', 'artist_words', 'description'];
const LANGS = ['sw', 'en', 'ko'];

function cleanFields(d) {
  const out = {};
  const str = v => { v = (v == null ? '' : String(v)).trim(); return v === '' ? null : v.slice(0, 4000); };
  out.year = str(d.year);
  for (const k of ['width', 'height']) {
    const n = d[k] === '' || d[k] == null ? null : Number(d[k]);
    if (n !== null && !(n > 0 && n < 100000)) throw new Error(`${k} must be a positive number`);
    out[k] = n;
  }
  out.unit = str(d.unit); if (out.unit && !['cm', 'in'].includes(out.unit)) throw new Error('unit must be cm or in');
  out.place = str(d.place);
  for (const k of ['signed', 'framed']) out[k] = d[k] === '' || d[k] == null ? null : (d[k] === true || d[k] === 1 || d[k] === '1' || d[k] === 'yes') ? 1 : 0;
  out.exhibited = str(d.exhibited);
  out.shop_url = str(d.shop_url);
  if (out.shop_url && !/^https:\/\/(www\.)?voiceofpiece\.com\//.test(out.shop_url)) throw new Error('Shop link must start with https://voiceofpiece.com/');
  const texts = {};
  for (const l of LANGS) {
    const t = (d.texts && d.texts[l]) || {};
    texts[l] = {};
    for (const f of TEXT_FIELDS) texts[l][f] = str(t[f]);
  }
  return { out, texts };
}

async function snapshot(env, artworkId) {
  const [w, t, i] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM artworks WHERE id = ?1').bind(artworkId),
    env.DB.prepare('SELECT lang, title, medium, artist_words, description FROM artwork_texts WHERE artwork_id = ?1').bind(artworkId),
    env.DB.prepare('SELECT r2_key, image_type FROM artwork_images WHERE artwork_id = ?1').bind(artworkId),
  ]);
  return JSON.stringify({ artwork: w.results[0], texts: t.results, images: i.results });
}

function textStatements(env, artworkId, texts) {
  const st = [];
  for (const l of LANGS) {
    const t = texts[l];
    const empty = TEXT_FIELDS.every(f => t[f] === null);
    if (empty) st.push(env.DB.prepare('DELETE FROM artwork_texts WHERE artwork_id = ?1 AND lang = ?2').bind(artworkId, l));
    else st.push(env.DB.prepare(
      `INSERT INTO artwork_texts (artwork_id, lang, title, medium, artist_words, description, source, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'vop', ${now})
       ON CONFLICT(artwork_id, lang) DO UPDATE SET title = excluded.title, medium = excluded.medium,
         artist_words = excluded.artist_words, description = excluded.description, source = 'vop', updated_at = ${now}`
    ).bind(artworkId, l, t.title, t.medium, t.artist_words, t.description));
  }
  return st;
}

async function updateArtwork(request, env, no, admin) {
  const row = await env.DB.prepare('SELECT id FROM artworks WHERE catalogue_no = ?1').bind(no).first();
  if (!row) return err('Artwork not found', 404);
  let body; try { body = await request.json(); } catch { return err('Bad request', 400); }
  let c; try { c = cleanFields(body); } catch (e) { return err(e.message, 400); }
  const snap = await snapshot(env, row.id);
  const f = c.out;
  await env.DB.batch([
    env.DB.prepare(`UPDATE artworks SET year=?1, width=?2, height=?3, unit=?4, place=?5, signed=?6, framed=?7, exhibited=?8, shop_url=?9, updated_at=${now} WHERE id=?10`)
      .bind(f.year, f.width, f.height, f.unit, f.place, f.signed, f.framed, f.exhibited, f.shop_url, row.id),
    ...textStatements(env, row.id, c.texts),
    env.DB.prepare(`INSERT INTO artwork_reviews (artwork_id, action, snapshot, actor_email) VALUES (?1, 'edited', ?2, ?3)`).bind(row.id, snap, admin),
  ]);
  return ok({ saved: no });
}

async function readPhoto(request) {
  const form = await request.formData();
  const file = form.get('photo');
  if (!file || typeof file === 'string') throw new Error('Choose a photo');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Photo must be JPG, PNG or WebP');
  if (file.size > 15 * 1024 * 1024) throw new Error('Photo is larger than 15 MB');
  const w = parseInt(form.get('width'), 10) || null, h = parseInt(form.get('height'), 10) || null;
  let data = {}; try { data = JSON.parse(form.get('data') || '{}'); } catch { throw new Error('Bad form data'); }
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  return { file, w, h, data, ext };
}

async function createArtwork(request, env, slug, admin) {
  const artist = await env.DB.prepare('SELECT id, code, slug FROM artists WHERE slug = ?1').bind(slug).first();
  if (!artist) return err('Artist not found', 404);
  let p, c;
  try { p = await readPhoto(request); c = cleanFields(p.data); } catch (e) { return err(e.message, 400); }

  // Reserve the next catalogue number in ONE statement (never select-then-update).
  const res = await env.DB.prepare(
    `UPDATE artists SET next_artwork_no = next_artwork_no + 1, updated_at = ${now} WHERE id = ?1 RETURNING next_artwork_no - 1 AS n`
  ).bind(artist.id).first();
  const no = `VOP-${artist.code}-${String(res.n).padStart(3, '0')}`;
  const key = `artists/${artist.slug}/${no}/main-${Date.now()}.${p.ext}`;

  await env.PHOTOS.put(key, p.file.stream(), { httpMetadata: { contentType: p.file.type } });
  const last = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM artworks WHERE artist_id = ?1').bind(artist.id).first();
  const f = c.out;
  const ins = await env.DB.prepare(
    `INSERT INTO artworks (catalogue_no, artist_id, year, width, height, unit, place, signed, framed, exhibited, shop_url, status, sort_order, published_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'published', ?12, ${now}) RETURNING id`
  ).bind(no, artist.id, f.year, f.width, f.height, f.unit, f.place, f.signed, f.framed, f.exhibited, f.shop_url, last.m + 1).first();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO artwork_images (artwork_id, r2_key, image_type, sort_order, width, height) VALUES (?1, ?2, 'main', 0, ?3, ?4)`)
      .bind(ins.id, key, p.w, p.h),
    ...textStatements(env, ins.id, c.texts),
    env.DB.prepare(`INSERT INTO artwork_reviews (artwork_id, action, actor_email) VALUES (?1, 'created', ?2)`).bind(ins.id, admin),
  ]);
  return ok({ created: no });
}

async function replacePhoto(request, env, no, admin) {
  const row = await env.DB.prepare(
    `SELECT a.id, x.slug FROM artworks a JOIN artists x ON x.id = a.artist_id WHERE a.catalogue_no = ?1`).bind(no).first();
  if (!row) return err('Artwork not found', 404);
  let p; try { p = await readPhoto(request); } catch (e) { return err(e.message, 400); }
  const snap = await snapshot(env, row.id);
  const key = `artists/${row.slug}/${no}/main-${Date.now()}.${p.ext}`;   // new name, so no stale cached photo
  await env.PHOTOS.put(key, p.file.stream(), { httpMetadata: { contentType: p.file.type } });
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM artwork_images WHERE artwork_id = ?1 AND image_type = 'main'`).bind(row.id),
    env.DB.prepare(`INSERT INTO artwork_images (artwork_id, r2_key, image_type, sort_order, width, height) VALUES (?1, ?2, 'main', 0, ?3, ?4)`)
      .bind(row.id, key, p.w, p.h),
    env.DB.prepare(`UPDATE artworks SET updated_at = ${now} WHERE id = ?1`).bind(row.id),
    env.DB.prepare(`INSERT INTO artwork_reviews (artwork_id, action, snapshot, actor_email) VALUES (?1, 'photo_added', ?2, ?3)`).bind(row.id, snap, admin),
  ]);
  return ok({ photo: photoUrl(key) });
}

async function setStatus(request, env, no, admin) {
  const row = await env.DB.prepare('SELECT id, status FROM artworks WHERE catalogue_no = ?1').bind(no).first();
  if (!row) return err('Artwork not found', 404);
  let body; try { body = await request.json(); } catch { return err('Bad request', 400); }
  const s = body.status;
  if (!['published', 'hidden'].includes(s)) return err('Bad status', 400);
  if (s === row.status) return ok({ status: s });
  await env.DB.batch([
    env.DB.prepare(`UPDATE artworks SET status = ?1, updated_at = ${now}, published_at = COALESCE(published_at, ${now}) WHERE id = ?2`).bind(s, row.id),
    env.DB.prepare(`INSERT INTO artwork_reviews (artwork_id, action, actor_email) VALUES (?1, ?2, ?3)`).bind(row.id, s === 'hidden' ? 'hidden' : 'restored', admin),
  ]);
  return ok({ status: s });
}

/* ---------------- writing help (OpenAI) ---------------- */
// Needs the Worker secret OPENAI_API_KEY. Optional var OPENAI_MODEL (default below).
//   POST /api/studio/polish         { text }                  -> { text }      same language, cleaned up
//   POST /api/studio/translate-all  { fields: {title, medium, description} }
//                                   -> { texts: { sw:{...}, en:{...}, ko:{...} } }

const LANG_NAMES = { sw: 'Swahili', en: 'English', ko: 'Korean' };
const TR_FIELDS = ['title', 'medium', 'description'];

async function askModel(env, prompt) {
  let r;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-6-luna',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch { return null; }
  if (!r.ok) return null;
  try { return JSON.parse((await r.json()).choices[0].message.content); } catch { return null; }
}

async function polish(request, env) {
  if (!env.OPENAI_API_KEY) return err('Translation is not set up', 500);
  let body; try { body = await request.json(); } catch { return err('Bad request', 400); }
  const text = String(body.text || '').trim().slice(0, 4000);
  if (!text) return err('Bad request', 400);
  const prompt = `An artist wrote this rough description of one of their artworks. Turn it into a clear, natural description for a gallery website.

Rules:
- Write in the SAME language the artist used. Do not translate.
- Keep the artist's meaning, feeling and point of view. If they wrote "I", keep "I".
- Fix spelling, grammar and flow. Keep it about the same length or shorter.
- Do not add facts, interpretations, places, dates or feelings that are not in the text.
- Plain, warm, honest language. No marketing words, no clichés.

Reply with JSON only: {"text": "..."}

Artist's text:
${text}`;
  const out = await askModel(env, prompt);
  if (!out || typeof out.text !== 'string' || !out.text.trim()) return err('Translation failed', 502);
  return ok({ text: out.text.trim().slice(0, 4000) });
}

async function translateAll(request, env) {
  if (!env.OPENAI_API_KEY) return err('Translation is not set up', 500);
  let body; try { body = await request.json(); } catch { return err('Bad request', 400); }
  const fields = {};
  for (const f of TR_FIELDS) {
    const v = body.fields && body.fields[f];
    if (typeof v === 'string' && v.trim()) fields[f] = v.trim().slice(0, 4000);
  }
  const keys = Object.keys(fields);
  if (!keys.length) return ok({ texts: { sw: {}, en: {}, ko: {} } });

  const shape = `{"source": {${keys.map(k => `"${k}": "sw|en|ko|other"`).join(', ')}}, ` +
    LANGS.map(l => `"${l}": {${keys.map(k => `"${k}": "..."`).join(', ')}}`).join(', ') + '}';
  const prompt = `Give each field of this artwork record in Swahili (sw), English (en) and Korean (ko).

Rules:
- Each field may be written in any language. In "source", say which language each field is written in.
- For the language a field is already written in, copy it exactly, unchanged.
- title: a short artwork title. No quotation marks, no extra words.
- medium: the artwork medium, written the way galleries write it.
- description: translate faithfully and naturally. Do not add or remove information.

Reply with JSON only, in exactly this shape:
${shape}

Fields:
${JSON.stringify(fields, null, 2)}`;
  const out = await askModel(env, prompt);
  if (!out) return err('Translation failed', 502);
  const texts = { sw: {}, en: {}, ko: {} };
  for (const l of LANGS) for (const k of keys) {
    const src = out.source && out.source[k];
    const v = src === l ? fields[k] : (out[l] && out[l][k]);          // never let the model change the original
    if (typeof v !== 'string' || !v.trim()) return err('Translation failed', 502);
    texts[l][k] = v.trim().slice(0, 4000);
  }
  return ok({ texts });
}

/* ---------------- helpers ---------------- */

function photoUrl(key) { return '/photos/' + key.split('/').map(encodeURIComponent).join('/'); }
function ok(d) { return new Response(JSON.stringify(d), { headers: JSONH }); }
function err(msg, status) { return new Response(JSON.stringify({ error: msg }), { status, headers: JSONH }); }
function readCookie(request) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([A-Za-z0-9_-]+)'));
  return m ? m[1] : null;
}
function randomToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);   // equal length, compare every char
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
