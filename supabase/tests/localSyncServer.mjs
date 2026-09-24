// TEST ONLY — a stand-in for the few Supabase endpoints sync uses, backed by
// real Postgres (PGlite) with every migration applied. Lets the real app run
// end to end in a browser with no Supabase project:
//
//   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321   (in .env)
//   node supabase/tests/localSyncServer.mjs
//
// It TRUSTS UNSIGNED TOKENS: the user id is read from the JWT without
// verifying it. Never expose it beyond localhost. It implements only:
//   POST /rest/v1/rpc/sync_push   POST /rest/v1/rpc/sync_pull
//   GET  /auth/v1/user            GET  /rest/v1/profiles?id=eq.<uid>
import http from 'node:http';
import { createDatabase, as, createUser } from './pgHarness.mjs';

const PORT = Number(process.env.PORT ?? 54321);
const db = await createDatabase();
const knownUsers = new Set();

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-headers':
    'authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-supabase-api-version',
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function userIdFrom(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).sub ?? null;
  } catch {
    return null;
  }
}

async function ensureUser(uid) {
  if (knownUsers.has(uid)) return;
  const exists = await db.query('select 1 from auth.users where id = $1', [uid]);
  if (exists.rows.length === 0) await createUser(db, uid, 'user_' + uid.replace(/-/g, '').slice(0, 8));
  knownUsers.add(uid);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const started = Date.now();
  const log = (status) => console.log(`${req.method} ${url.pathname} ${status} ${Date.now() - started}ms`);

  if (req.method === 'OPTIONS') { send(res, 204); return; }
  if (url.pathname === '/') {
    res.writeHead(200, { ...CORS, 'content-type': 'text/plain' });
    res.end('HabitBrick local sync test server (TEST ONLY)');
    return;
  }

  const uid = userIdFrom(req);
  if (!uid) { send(res, 401, { message: 'JWT required' }); log(401); return; }

  try {
    await ensureUser(uid);

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/sync_push') {
      const body = await readBody(req);
      const result = await as(db, uid, () => db.query('select public.sync_push($1::jsonb, $2::jsonb) as r',
        [JSON.stringify(body.p_habits ?? []), JSON.stringify(body.p_completions ?? [])]));
      send(res, 200, result.rows[0].r); log(200); return;
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/sync_pull') {
      const body = await readBody(req);
      const result = await as(db, uid, () => db.query('select public.sync_pull($1::timestamptz) as r', [body.p_since ?? null]));
      send(res, 200, result.rows[0].r); log(200); return;
    }
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      send(res, 200, { id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@example.com`,
        app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
      log(200); return;
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/profiles') {
      const result = await as(db, uid, () => db.query(
        'select id, username, display_name, avatar_url, created_at from public.profiles where id = $1', [uid]));
      const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
      send(res, 200, single ? result.rows[0] : result.rows); log(200); return;
    }
    send(res, 404, { message: `not implemented: ${req.method} ${url.pathname}` }); log(404);
  } catch (error) {
    send(res, 400, { message: error.message, code: error.code }); log(400);
  }
});

// Loopback only. This server trusts unsigned tokens, so it must never be
// reachable from the network; listen() without a host would bind every
// interface and expose it to the LAN.
server.listen(PORT, 'localhost', () =>
  console.log(`local sync test server on http://localhost:${PORT} (TEST ONLY, loopback)`),
);
