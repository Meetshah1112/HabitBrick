// Shared database harness for the Node test suites: real Postgres (PGlite,
// compiled to WASM — no Docker) with every migration applied, plus helpers to
// act as Supabase's `authenticated` / `anon` roles and a tiny check reporter.
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every migration, in name order, so new ones are covered automatically. */
export const MIGRATIONS = readdirSync(join(REPO, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => 'supabase/migrations/' + f);

export function createReporter() {
  const counts = { passed: 0, failed: 0 };
  const pass = (label) => { counts.passed++; console.log('  PASS ' + label); };
  const fail = (label, why) => { counts.failed++; console.log('  FAIL ' + label + ' -- ' + why); };
  const check = (label, cond, why) => (cond ? pass(label) : fail(label, why));
  const finish = () => {
    console.log(`\n${counts.passed} passed, ${counts.failed} failed`);
    process.exit(counts.failed ? 1 : 0);
  };
  return { pass, fail, check, finish, counts };
}

/**
 * A fresh database with the auth stub and all migrations applied. `onApplied`
 * is told about each file so a suite can report it.
 */
export async function createDatabase({ onApplied = () => {}, onFailed } = {}) {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  for (const file of ['supabase/_local_test_stub.sql', ...MIGRATIONS]) {
    try {
      await db.exec(readFileSync(join(REPO, file), 'utf8'));
      onApplied(file);
    } catch (error) {
      if (onFailed) onFailed(file, error);
      throw error;
    }
  }
  // Mimic Supabase defaults: API roles get table privileges; RLS restricts.
  await db.exec(`
    grant usage on schema public, auth to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
  `);
  return db;
}

/** Run `fn` as a signed-in user (uid) or as anon (null), like PostgREST does. */
export async function as(db, uid, fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

export async function createUser(db, id, username) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, `${username}@example.com`, JSON.stringify({ username })]);
}
