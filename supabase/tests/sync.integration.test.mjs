// Two-device sync, end to end: the app's REAL sync engine, merge and outbox
// code (imported from src/, TypeScript run natively by Node) syncing through
// the REAL sync_push / sync_pull SQL on real Postgres (PGlite).
//
//   npm run db:test
//
// Nothing between the devices and the database is faked. Every scenario ends
// by syncing both devices and asserting they hold identical data.
import { createDatabase, as, createReporter, createUser } from './pgHarness.mjs';
import { performSync } from '../../src/sync/syncEngine.ts';
import {
  createMemoryDevice, addHabit, renameHabit, deleteHabit, complete, uncomplete,
} from '../../src/sync/__tests__/memoryDevice.ts';

const { check, finish } = createReporter();
const db = await createDatabase();
const NOW = () => new Date(2026, 8, 24, 12);
let userCounter = 0;
let clockCounter = 0;

/** Strictly increasing client clocks, one per user action. */
const tick = () => new Date(Date.UTC(2026, 8, 24, 8, 0, 0) + ++clockCounter * 1000).toISOString();

async function newUser() {
  const id = `00000000-0000-4000-8000-${String(++userCounter).padStart(12, '0')}`;
  await createUser(db, id, `user${userCounter}`);
  return id;
}

/** The app's SyncGateway, backed by the real SQL instead of PostgREST. */
function gatewayFor(uid, { offline = () => false } = {}) {
  return {
    async push(payload) {
      if (offline()) return { ok: false, error: 'offline' };
      try {
        await as(db, uid, () => db.query('select public.sync_push($1::jsonb, $2::jsonb)',
          [JSON.stringify(payload.habits), JSON.stringify(payload.completions)]));
        return { ok: true, data: null };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    async pull(since) {
      if (offline()) return { ok: false, error: 'offline' };
      try {
        const result = await as(db, uid, () => db.query('select public.sync_pull($1::timestamptz) as r', [since]));
        const r = result.rows[0].r;
        return { ok: true, data: { habits: r.habits, completions: r.completions, serverTime: r.server_time } };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
  };
}

function device(uid, options) {
  const d = createMemoryDevice([], NOW);
  const gateway = gatewayFor(uid, options);
  return { ...d, sync: () => performSync(gateway, d.port) };
}

/** What must be identical across devices: synced fields and done days. */
function view(d) {
  return [...d.habits()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((h) => ({
      id: h.id, title: h.title, category: h.category, frequency: h.frequency.join(''),
      days: Object.keys(h.completionLog).filter((k) => h.completionLog[k]).sort().join(','),
    }));
}

async function settle(...devices) {
  for (let round = 0; round < 2; round++) for (const d of devices) await d.sync();
}

function converged(label, a, b, expectation) {
  const va = JSON.stringify(view(a));
  const vb = JSON.stringify(view(b));
  check(`${label} — devices converge`, va === vb, `\n      phone:  ${va}\n      tablet: ${vb}`);
  if (expectation) check(`${label} — ${expectation.what}`, expectation.test(view(a)), JSON.stringify(view(a)));
}

// -------------------------------------------------------------------------
console.log('\n== Two devices, one account, real Postgres ==');

{
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  phone.act(complete('h1', '2026-09-23', tick()), tick());
  await settle(phone, tablet);
  converged('a habit and its history created on one device appear on the other', phone, tablet,
    { what: 'tablet has it', test: (v) => v.length === 1 && v[0].title === 'Read' && v[0].days === '2026-09-23' });
}

{
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  await settle(phone, tablet);
  tablet.act(complete('h1', '2026-09-24', tick()), tick());
  await settle(tablet, phone);
  converged('a completion made on the tablet reaches the phone', phone, tablet,
    { what: "today is done on the phone", test: (v) => v[0].days === '2026-09-24' });
  check('...and the phone recomputes its streak for it',
    phone.habits()[0].completedToday === true && phone.habits()[0].currentStreak === 1,
    JSON.stringify(phone.habits()[0]));
}

for (const order of ['tablet syncs first', 'phone syncs first']) {
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  await settle(phone, tablet);
  // Both offline; the tablet's rename happens later in real time.
  phone.act(renameHabit('h1', 'Phone name'), tick());
  tablet.act(renameHabit('h1', 'Tablet name'), tick());
  if (order === 'tablet syncs first') await settle(tablet, phone);
  else await settle(phone, tablet);
  converged(`concurrent renames (${order})`, phone, tablet,
    { what: 'the later rename wins', test: (v) => v[0].title === 'Tablet name' });
}

{
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  phone.act(complete('h1', '2026-09-22', tick()), tick());
  phone.act(complete('h1', '2026-09-23', tick()), tick());
  await settle(phone, tablet);
  phone.act(uncomplete('h1', '2026-09-23'), tick());
  await settle(phone, tablet);
  // The tablet still "remembers" the 23rd from earlier syncs; it must not
  // push it back up.
  await settle(tablet, phone);
  converged('an un-completion propagates and is not resurrected by the stale device', phone, tablet,
    { what: 'only the 22nd remains', test: (v) => v[0].days === '2026-09-22' });
}

{
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  phone.act(complete('h1', '2026-09-23', tick()), tick());
  await settle(phone, tablet);
  // Offline on both: phone un-completes, then the tablet re-completes later.
  phone.act(uncomplete('h1', '2026-09-23'), tick());
  tablet.act(uncomplete('h1', '2026-09-23'), tick());
  tablet.act(complete('h1', '2026-09-23', tick()), tick());
  await settle(phone, tablet);
  converged('toggling the same day on both devices', phone, tablet,
    { what: "the latest action (tablet re-completing) wins", test: (v) => v[0].days === '2026-09-23' });
}

{
  const uid = await newUser();
  const phone = device(uid), tablet = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  await settle(phone, tablet);
  phone.act(deleteHabit('h1'), tick());
  tablet.act(renameHabit('h1', 'Renamed after the delete'), tick()); // later, but offline
  tablet.act(complete('h1', '2026-09-24', tick()), tick());
  await settle(phone, tablet);
  await settle(tablet, phone);
  converged('a deletion beats a later offline edit on the other device', phone, tablet,
    { what: 'the habit is gone everywhere', test: (v) => v.length === 0 });
}

{
  const uid = await newUser();
  let tabletOffline = true;
  const phone = device(uid), tablet = device(uid, { offline: () => tabletOffline });
  phone.act(addHabit('h1', 'Read'), tick());
  await phone.sync();
  tablet.act(addHabit('t1', 'Stretch'), tick());
  tablet.act(complete('t1', '2026-09-22', tick()), tick());
  tablet.act(complete('t1', '2026-09-23', tick()), tick());
  const failed = await tablet.sync();
  check('an offline sync fails without losing anything', failed.ok === false &&
    Object.keys(tablet.outbox().habits).length === 1, JSON.stringify(tablet.outbox()));
  tabletOffline = false;
  await settle(tablet, phone);
  converged('changes made offline land once the device reconnects', phone, tablet,
    { what: 'both habits on both devices', test: (v) => v.map((h) => h.id).join() === 'h1,t1' && v[1].days === '2026-09-22,2026-09-23' });
}

{
  const uid = await newUser();
  const phone = device(uid);
  phone.act(addHabit('h1', 'Read'), tick());
  phone.act(complete('h1', '2026-09-23', tick()), tick());
  phone.act(addHabit('h2', 'Deleted later'), tick());
  await phone.sync();
  phone.act(deleteHabit('h2'), tick());
  await phone.sync();
  const freshInstall = device(uid);
  await freshInstall.sync();
  converged('a fresh install restores the account (minus deleted habits)', phone, freshInstall,
    { what: 'only the live habit is restored', test: (v) => v.length === 1 && v[0].id === 'h1' });
}

{
  const alice = await newUser();
  const bob = await newUser();
  const alicePhone = device(alice), bobPhone = device(bob);
  alicePhone.act(addHabit('shared-id', 'Alice private habit'), tick());
  bobPhone.act(addHabit('shared-id', 'Bob habit'), tick());
  await settle(alicePhone, bobPhone);
  check('two accounts never see each other\'s habits, even with the same local id',
    alicePhone.habits()[0].title === 'Alice private habit' && bobPhone.habits()[0].title === 'Bob habit' &&
    alicePhone.habits().length === 1 && bobPhone.habits().length === 1,
    JSON.stringify([view(alicePhone), view(bobPhone)]));
}

finish();
