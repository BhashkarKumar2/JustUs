// Live location end-to-end: real server process + in-memory MongoDB + socket clients.
import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { io as ioClient } from 'socket.io-client';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';

jest.setTimeout(120000);

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5197;
const API = `http://127.0.0.1:${PORT}`;
const UPDATE_MIN_MS = 1500; // server's per-message update limit, shortened for the test
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let mongo, client, db, server, logs = '';
const ids = {}, tok = {}, sock = {};

// Collect every event per socket so tests can assert on presence AND absence.
const events = {};
const seen = (who, ev, pred = () => true) => events[who].filter((e) => e.ev === ev && pred(e.data || {}));
const waitFor = async (who, ev, pred, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = seen(who, ev, pred)[0];
    if (hit) return hit.data;
    await sleep(50);
  }
  return null;
};
const connect = (who) => new Promise((resolve, reject) => {
  const s = ioClient(API, { auth: { token: tok[who] }, transports: ['websocket'], reconnection: false });
  events[who] = [];
  s.onAny((ev, data) => events[who].push({ ev, data }));
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const msgDoc = (id) => db.collection('messages').findOne({ _id: new ObjectId(String(id)) });
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

const sendDmLive = async (from, to, untilIso, lat = 10, lng = 20) => {
  const content = `marker-${Math.random()}`; // content is replaced server-side; find by metadata instead
  const before = Date.now();
  sock[from].emit('chat.send', { receiverId: String(ids[to]), type: 'location', content, metadata: { lat, lng, accuracy: 30, live: true, liveUntil: untilIso } });
  const msg = await waitFor(to, 'message', (d) => d.type === 'location' && d.metadata?.lat === lat && new Date(d.timestamp).getTime() >= before - 1000);
  return msg;
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('justus');
  client = await MongoClient.connect(uri);
  db = client.db('justus');
  const hash = await bcrypt.hash('Passw0rd!', 10);
  for (const n of ['alice', 'bob', 'carol']) {
    ids[n] = new ObjectId();
    await db.collection('users').insertOne({ _id: ids[n], username: n, email: `${n}@t.local`, displayName: n, passwordHash: hash, isVerified: true, contacts: [], createdAt: new Date(), updatedAt: new Date() });
  }
  await db.collection('users').updateOne({ _id: ids.alice }, { $set: { contacts: [ids.bob] } });
  await db.collection('users').updateOne({ _id: ids.bob }, { $set: { contacts: [ids.alice] } });

  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', MONGODB_URI: uri, JWT_SECRET: 'location-test-secret-0123456789', LOCATION_SWEEP_MS: '300', LOCATION_UPDATE_MIN_MS: String(UPDATE_MIN_MS) },
  });
  server.stdout.on('data', (d) => { logs += d; });
  server.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${API}/api/health`)).ok) break; } catch { /* starting */ }
    await sleep(250);
  }
  for (const n of ['alice', 'bob', 'carol']) {
    const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: n, password: 'Passw0rd!' }) });
    tok[n] = (await r.json()).token;
    sock[n] = await connect(n);
  }
});

afterAll(async () => {
  if (process.env.LOC_TEST_LOG) fs.writeFileSync(process.env.LOC_TEST_LOG, logs); // debugging aid
  Object.values(sock).forEach((s) => s.disconnect());
  server?.kill();
  await client?.close();
  await mongo?.stop();
});

describe('sending', () => {
  test('rejects a location with invalid coordinates', async () => {
    sock.alice.emit('chat.send', { receiverId: String(ids.bob), type: 'location', content: 'x', metadata: { lat: 200, lng: 0 } });
    expect(await waitFor('alice', 'error', (d) => d.message === 'Invalid location')).not.toBeNull();
    expect(await db.collection('messages').countDocuments({ type: 'location', 'metadata.lat': 200 })).toBe(0);
  });

  test('a pin is delivered with normalized metadata and fallback content', async () => {
    sock.alice.emit('chat.send', { receiverId: String(ids.bob), type: 'location', content: 'ignored', metadata: { lat: 1.23456789, lng: 2, accuracy: 12 } });
    const m = await waitFor('bob', 'message', (d) => d.type === 'location' && d.metadata?.lat === 1.234568);
    expect(m).not.toBeNull();
    expect(m.content).toBe('📍 Location');
    expect(m.metadata.live).toBe(false);
  });
});

describe('live location in a DM', () => {
  let live;
  beforeAll(async () => { live = await sendDmLive('alice', 'bob', inMinutes(15), 11, 21); });

  test('the live share is delivered', () => {
    expect(live).not.toBeNull();
    expect(live.content).toBe('📍 Live location');
    expect(live.metadata.liveEnded).toBe(false);
  });

  test('a sender update reaches both sides and is stored', async () => {
    sock.alice.emit('location.update', { messageId: live.id, lat: 11.5, lng: 21.5, accuracy: 15 });
    const onBob = await waitFor('bob', 'location.updated', (d) => d.id === String(live.id) && d.metadata.lat === 11.5);
    const onAlice = await waitFor('alice', 'location.updated', (d) => d.id === String(live.id) && d.metadata.lat === 11.5);
    expect(onBob).not.toBeNull();
    expect(onAlice).not.toBeNull();
    expect((await msgDoc(live.id)).metadata.lng).toBe(21.5);
  });

  test('a second update inside the rate window is dropped', async () => {
    sock.alice.emit('location.update', { messageId: live.id, lat: 11.6, lng: 21.6 });
    expect(await waitFor('bob', 'location.updated', (d) => d.metadata.lat === 11.6, 800)).toBeNull();
    await sleep(UPDATE_MIN_MS);
  });

  test('the receiver and an outsider cannot move or stop it', async () => {
    sock.bob.emit('location.update', { messageId: live.id, lat: 50, lng: 50 });
    sock.carol.emit('location.update', { messageId: live.id, lat: 51, lng: 51 });
    sock.bob.emit('location.stop', { messageId: live.id });
    sock.carol.emit('location.stop', { messageId: live.id });
    await sleep(800);
    const doc = await msgDoc(live.id);
    expect(doc.metadata.lat).toBe(11.5);
    expect(doc.metadata.liveEnded).toBe(false);
    expect(seen('carol', 'location.updated')).toHaveLength(0);
  });

  test('invalid coordinates in an update are ignored', async () => {
    sock.alice.emit('location.update', { messageId: live.id, lat: 'x', lng: 0 });
    await sleep(300);
    sock.alice.emit('location.update', { messageId: live.id, lat: 200, lng: 0 });
    await sleep(500);
    expect((await msgDoc(live.id)).metadata.lat).toBe(11.5);
    await sleep(UPDATE_MIN_MS);
  });

  test('stop by the sender ends it for both, and later updates are ignored', async () => {
    sock.alice.emit('location.stop', { messageId: live.id });
    expect(await waitFor('bob', 'location.updated', (d) => d.id === String(live.id) && d.metadata.liveEnded === true)).not.toBeNull();
    await sleep(UPDATE_MIN_MS);
    sock.alice.emit('location.update', { messageId: live.id, lat: 12, lng: 22 });
    await sleep(700);
    expect((await msgDoc(live.id)).metadata.lat).toBe(11.5);
  });
});

describe('ending', () => {
  test('an update after the end time ends the share instead of moving it', async () => {
    const live = await sendDmLive('alice', 'bob', new Date(Date.now() + 1500).toISOString(), 30, 40);
    // stop the sweep from winning the race: update right after expiry
    await sleep(1600);
    sock.alice.emit('location.update', { messageId: live.id, lat: 31, lng: 41 });
    expect(await waitFor('bob', 'location.updated', (d) => d.id === String(live.id) && d.metadata.liveEnded === true)).not.toBeNull();
    expect((await msgDoc(live.id)).metadata.lat).toBe(30);
  });

  test('the sweep ends an overdue share with no client involvement', async () => {
    const live = await sendDmLive('alice', 'bob', new Date(Date.now() + 1000).toISOString(), 32, 42);
    expect(await waitFor('bob', 'location.updated', (d) => d.id === String(live.id) && d.metadata.liveEnded === true, 4000)).not.toBeNull();
    expect((await msgDoc(live.id)).metadata.liveEnded).toBe(true);
  });

  test('delete for everyone ends a live share', async () => {
    const live = await sendDmLive('alice', 'bob', inMinutes(15), 33, 43);
    sock.alice.emit('chat.delete', { id: live.id });
    expect(await waitFor('bob', 'messages.deleted', (d) => d.id === String(live.id))).not.toBeNull();
    expect((await msgDoc(live.id)).metadata.liveEnded).toBe(true);
  });

  test('starting a second live share in the same chat ends the first', async () => {
    const first = await sendDmLive('alice', 'bob', inMinutes(15), 34, 44);
    const second = await sendDmLive('alice', 'bob', inMinutes(15), 35, 45);
    expect(second).not.toBeNull();
    expect(await waitFor('bob', 'location.updated', (d) => d.id === String(first.id) && d.metadata.liveEnded === true)).not.toBeNull();
    expect((await msgDoc(second.id)).metadata.liveEnded).toBe(false);
  });
});

describe('live location in a group', () => {
  test('members get updates without opening the group; a removed member stops getting them', async () => {
    const r = await fetch(`${API}/api/groups`, { method: 'POST', headers: { authorization: `Bearer ${tok.alice}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'loc group', memberIds: [String(ids.bob), String(ids.carol)] }) });
    const g = (await r.json()).group;
    const gid = String(g.id || g._id);
    sock.alice.emit('group.send', { groupId: gid, type: 'location', content: 'x', metadata: { lat: 40, lng: 50, live: true, liveUntil: inMinutes(15) } });
    const live = await waitFor('bob', 'group.message', (d) => d.type === 'location' && d.metadata?.lat === 40);
    expect(live).not.toBeNull();
    const liveId = String(live.id || live._id);

    sock.alice.emit('location.update', { messageId: liveId, lat: 40.5, lng: 50.5 });
    expect(await waitFor('bob', 'location.updated', (d) => d.id === liveId && d.metadata.lat === 40.5)).not.toBeNull();
    expect(await waitFor('carol', 'location.updated', (d) => d.id === liveId && d.metadata.lat === 40.5)).not.toBeNull();

    await fetch(`${API}/api/groups/${gid}/members/${ids.carol}`, { method: 'DELETE', headers: { authorization: `Bearer ${tok.alice}` } });
    await sleep(UPDATE_MIN_MS);
    sock.alice.emit('location.update', { messageId: liveId, lat: 41, lng: 51 });
    expect(await waitFor('bob', 'location.updated', (d) => d.id === liveId && d.metadata.lat === 41)).not.toBeNull();
    expect(seen('carol', 'location.updated', (d) => d.id === liveId && d.metadata.lat === 41)).toHaveLength(0);
  });
});

test('no server exceptions', () => {
  expect(logs).not.toMatch(/TypeError|ReferenceError|Error handling location/);
});
