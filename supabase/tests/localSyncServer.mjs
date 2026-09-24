// TEST ONLY — a stand-in for the Supabase endpoints the app uses, backed by
// real Postgres (PGlite) with every migration applied. Lets the real app run
// end to end in a browser with no Supabase project:
//
//   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321   (in .env)
//   node supabase/tests/localSyncServer.mjs
//
// It TRUSTS UNSIGNED TOKENS: the user id is read from the JWT without
// verifying it, so it listens on loopback only. Every query still runs AS
// that user under the real RLS policies — this is a transport shim, not a
// bypass. Implements only what the app calls:
//   POST   /rest/v1/rpc/<allowlisted function>   (named JSON arguments)
//   GET    /auth/v1/user
//   GET    /rest/v1/profiles?id=eq.<uid>          PATCH /rest/v1/profiles?id=eq.<uid>
//   POST   /rest/v1/<activity_events|claps>       (upsert, ignore duplicates)
//   DELETE /rest/v1/<claps|friendships|blocks>?<col>=eq.<value>...
import http from 'node:http';
import { createDatabase, as, createUser } from './pgHarness.mjs';

const PORT = Number(process.env.PORT ?? 54321);
const db = await createDatabase();
const knownUsers = new Set();

const RPCS = new Set([
  'sync_push', 'sync_pull', 'search_profiles', 'username_available', 'my_friendships', 'my_blocks',
  'send_friend_request', 'respond_to_friend_request', 'block_user', 'friend_feed', 'friends_leaderboard',
]);
const INSERT_TABLES = new Set(['activity_events', 'claps']);
const DELETE_TABLES = new Set(['claps', 'friendships', 'blocks']);
const IDENT = /^[a-z_]+$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

const param = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

/** PostgREST-style `col=eq.value` filters, identifiers allowlisted by pattern. */
function eqFilters(url) {
  const cols = [];
  const values = [];
  for (const [key, raw] of url.searchParams) {
    if (key === 'select' || key === 'on_conflict' || key === 'columns') continue;
    if (!IDENT.test(key) || !raw.startsWith('eq.')) throw new Error(`unsupported filter ${key}`);
    cols.push(key);
    values.push(raw.slice(3));
  }
  return { cols, values };
}

async function callRpc(uid, fn, args) {
  const keys = Object.keys(args);
  if (!keys.every((k) => IDENT.test(k))) throw new Error('bad argument name');
  const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  const values = keys.map((k) => param(args[k]));
  const meta = await db.query(
    "select proretset, prorettype::regtype::text as rettype from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace",
    [fn]);
  const { proretset, rettype } = meta.rows[0];
  if (proretset) return { status: 200, body: (await as(db, uid, () => db.query(`select * from ${call}`, values))).rows };
  const result = await as(db, uid, () => db.query(`select ${call} as r`, values));
  return rettype === 'void' ? { status: 204 } : { status: 200, body: result.rows[0].r };
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

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (req.method === 'POST' && rpc) {
      if (!RPCS.has(rpc[1])) { send(res, 404, { message: 'unknown rpc' }); log(404); return; }
      const { status, body } = await callRpc(uid, rpc[1], await readBody(req));
      send(res, status, body); log(status); return;
    }

    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      send(res, 200, { id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@example.com`,
        app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
      log(200); return;
    }

    const rest = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const name = rest?.[1];

    if (req.method === 'GET' && name === 'profiles') {
      const result = await as(db, uid, () => db.query(
        'select id, username, display_name, avatar_url, created_at from public.profiles where id = $1', [uid]));
      const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
      send(res, 200, single ? result.rows[0] : result.rows); log(200); return;
    }

    if (req.method === 'PATCH' && name === 'profiles') {
      const body = await readBody(req);
      const { cols, values } = eqFilters(url);
      if (cols.join() !== 'id' || typeof body.display_name !== 'string') throw new Error('unsupported profile update');
      await as(db, uid, () => db.query('update public.profiles set display_name = $1 where id = $2', [body.display_name, values[0]]));
      send(res, 204); log(204); return;
    }

    if (req.method === 'POST' && INSERT_TABLES.has(name)) {
      const body = await readBody(req);
      const rowsIn = Array.isArray(body) ? body : [body];
      const cols = Object.keys(rowsIn[0] ?? {});
      const conflict = (url.searchParams.get('on_conflict') ?? '').split(',').filter(Boolean);
      if (!cols.every((c) => IDENT.test(c)) || !conflict.every((c) => IDENT.test(c))) throw new Error('bad identifier');
      const ignore = (req.headers.prefer ?? '').includes('resolution=ignore-duplicates');
      for (const row of rowsIn) {
        const sql = `insert into public.${name} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})` +
          (ignore && conflict.length ? ` on conflict (${conflict.join(', ')}) do nothing` : '');
        await as(db, uid, () => db.query(sql, cols.map((c) => param(row[c]))));
      }
      send(res, 201); log(201); return;
    }

    if (req.method === 'DELETE' && DELETE_TABLES.has(name)) {
      const { cols, values } = eqFilters(url);
      if (cols.length === 0) throw new Error('refusing an unfiltered delete');
      await as(db, uid, () => db.query(
        `delete from public.${name} where ${cols.map((c, i) => `${c} = $${i + 1}`).join(' and ')}`, values));
      send(res, 204); log(204); return;
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
