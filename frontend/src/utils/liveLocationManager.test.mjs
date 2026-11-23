/**
 * Tests for the app-wide live-location sender.
 * Standalone (no test runner):  node src/utils/liveLocationManager.test.mjs
 */
import assert from 'node:assert/strict';
import { createLiveLocationManager } from './liveLocationManager.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const S = 1000;
const ME = 'u-me';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

function fakeSocket() {
  const handlers = {};
  return {
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, data) { this.sent.push({ ev, data }); },
    server(ev, data) { (handlers[ev] || []).forEach((fn) => fn(data)); },
    updates() { return this.sent.filter((s) => s.ev === 'location.update'); },
  };
}

function fakeGeo() {
  const g = {
    watching: null, cleared: 0,
    watchPosition(ok) { g.watching = ok; return 7; },
    clearWatch() { g.watching = null; g.cleared++; },
    move(lat, lng, accuracy = 10) { g.watching?.({ coords: { latitude: lat, longitude: lng, accuracy } }); },
  };
  return g;
}

/** A tab: its own manager, socket, geolocation and clock; storage can be shared between tabs. */
function tab({ storage = memoryStorage(), tabId = 'A', clock = { t: 1_000_000 }, deviceId = 'dev-1' } = {}) {
  const geo = fakeGeo();
  let ticker = null;
  const mgr = createLiveLocationManager({
    geolocation: geo, storage, tabId, deviceId, now: () => clock.t,
    setInterval: (fn) => { ticker = fn; return 1; }, clearInterval: () => { ticker = null; },
  });
  const socket = fakeSocket();
  mgr.attach(socket, ME);
  return { mgr, socket, geo, clock, storage, tick: () => ticker?.(), ticking: () => !!ticker };
}

const until = (clock, ms) => new Date(clock.t + ms).toISOString();
const ownLive = (clock, id = 'm1', extra = {}) => ({
  id, senderId: ME, type: 'location',
  metadata: { lat: 10, lng: 20, live: true, liveEnded: false, liveUntil: until(clock, 15 * 60 * S), updatedAt: new Date(clock.t).toISOString() },
  ...extra,
});

test('resumes a running share from location.active and sends the first fix at once', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 10 * 60 * S) }]);
  assert.ok(t.geo.watching, 'watching position');
  t.geo.move(10.5, 20.5, 12);
  assert.deepEqual(t.socket.updates().map((u) => u.data), [{ messageId: 'm1', lat: 10.5, lng: 20.5, accuracy: 12, sourceId: 'dev-1' }]);
});

test('throttles: nothing within 15 s, sends after 20 s and ~25 m', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 10 * 60 * S) }]);
  t.geo.move(10, 20);
  t.clock.t += 5 * S; t.geo.move(10.01, 20);
  assert.equal(t.socket.updates().length, 1);
  t.clock.t += 15 * S; t.geo.move(10.000225, 20);
  assert.equal(t.socket.updates().length, 2);
});

test('a stationary sender still sends every minute (heartbeat uses last fix)', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 10 * 60 * S) }]);
  t.geo.move(10, 20);
  t.clock.t += 30 * S; t.tick();
  assert.equal(t.socket.updates().length, 1);
  t.clock.t += 31 * S; t.tick();
  assert.equal(t.socket.updates().length, 2);
});

test('own new live share from this tab: first fix is already sent, so no instant duplicate', () => {
  const t = tab();
  t.mgr.markStarting();
  t.socket.server('message', ownLive(t.clock));
  t.geo.move(10, 20);
  assert.equal(t.socket.updates().length, 0);
  t.clock.t += 61 * S; t.geo.move(10, 20);
  assert.equal(t.socket.updates().length, 1);
});

test("other people's live shares, pins and ended shares are not tracked", () => {
  const t = tab();
  t.socket.server('message', ownLive(t.clock, 'x1', { senderId: 'u-other' }));
  t.socket.server('group.message', { ...ownLive(t.clock, 'x2'), metadata: { lat: 1, lng: 2, live: false } });
  t.socket.server('message', { ...ownLive(t.clock, 'x3'), metadata: { ...ownLive(t.clock).metadata, liveEnded: true } });
  assert.deepEqual(t.mgr.activeIds(), []);
  assert.equal(t.geo.watching, null);
});

test('only one of two tabs sends; the other takes over when the first goes quiet', () => {
  const storage = memoryStorage();
  const clock = { t: 1_000_000 };
  const a = tab({ storage, tabId: 'A', clock });
  const b = tab({ storage, tabId: 'B', clock });
  const active = [{ id: 'm1', liveUntil: until(clock, 10 * 60 * S) }];
  a.socket.server('location.active', active);
  b.socket.server('location.active', active);
  a.geo.move(10, 20);
  b.geo.move(10, 20);
  assert.equal(a.socket.updates().length + b.socket.updates().length, 1);
  assert.equal(a.socket.updates().length, 1);
  // tab A is closed (no more ticks/fixes); after the lock goes stale B takes over
  clock.t += 61 * S; b.geo.move(10.001, 20);
  assert.equal(b.socket.updates().length, 1);
});

test('a fresh share started in another tab is left to that tab', () => {
  const storage = memoryStorage();
  const clock = { t: 1_000_000 };
  const a = tab({ storage, tabId: 'A', clock });
  const b = tab({ storage, tabId: 'B', clock });
  a.mgr.markStarting();
  b.socket.server('message', ownLive(clock)); // B hears the echo first
  a.socket.server('message', ownLive(clock));
  for (let i = 0; i < 6; i++) { clock.t += 10 * S; b.tick(); a.tick(); } // both tabs stay open
  clock.t += 1 * S;
  b.geo.move(10.001, 20);
  a.geo.move(10.001, 20);
  assert.equal(a.socket.updates().length, 1);
  assert.equal(b.socket.updates().length, 0);
});

test('stops when the server says it ended', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 10 * 60 * S) }]);
  t.socket.server('location.updated', { id: 'm1', metadata: { live: true, liveEnded: true } });
  assert.deepEqual(t.mgr.activeIds(), []);
  assert.equal(t.geo.watching, null);
  assert.equal(t.ticking(), false);
});

test('a moved (not ended) update keeps it running', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 10 * 60 * S) }]);
  t.socket.server('location.updated', { id: 'm1', metadata: { live: true, liveEnded: false, lat: 1, lng: 1 } });
  assert.deepEqual(t.mgr.activeIds(), ['m1']);
});

test('stops at the end time without sending', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 60 * S) }]);
  t.clock.t += 61 * S;
  t.geo.move(10, 20);
  assert.equal(t.socket.updates().length, 0);
  assert.deepEqual(t.mgr.activeIds(), []);
});

test('stops when the message is deleted (DM and group events)', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }, { id: 'm2', liveUntil: until(t.clock, 600 * S) }]);
  t.socket.server('messages.deleted', { id: 'm1' });
  t.socket.server('group.message_deleted', { groupId: 'g', messageId: 'm2' });
  assert.deepEqual(t.mgr.activeIds(), []);
});

test('stop() tells the server and stops locally', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  t.mgr.stop('m1');
  assert.deepEqual(t.socket.sent.filter((s) => s.ev === 'location.stop').map((s) => s.data), [{ messageId: 'm1' }]);
  assert.deepEqual(t.mgr.activeIds(), []);
});

test('detach removes listeners; a new socket can be attached', () => {
  const t = tab();
  t.mgr.detach();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  assert.deepEqual(t.mgr.activeIds(), []);
  const s2 = fakeSocket();
  t.mgr.attach(s2, ME);
  s2.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  t.geo.move(1, 2);
  assert.equal(s2.updates().length, 1);
});

test('without geolocation nothing breaks', () => {
  const mgr = createLiveLocationManager({ geolocation: null, storage: memoryStorage(), tabId: 'A', now: () => 0, setInterval: () => 1, clearInterval: () => {} });
  const s = fakeSocket();
  mgr.attach(s, ME);
  s.server('location.active', [{ id: 'm1', liveUntil: new Date(600 * S).toISOString() }]);
  assert.equal(s.updates().length, 0);
});

test('updates carry this device id', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S), sourceId: 'dev-1' }]);
  t.geo.move(1, 2);
  assert.equal(t.socket.updates()[0].data.sourceId, 'dev-1');
});

test('live shares started on another device are not sent from here', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S), sourceId: 'dev-phone' }]);
  t.socket.server('message', ownLive(t.clock, 'm2', { metadata: { ...ownLive(t.clock).metadata, sourceId: 'dev-phone' } }));
  assert.deepEqual(t.mgr.activeIds(), []);
  assert.equal(t.geo.watching, null);
});

test('a stop pressed while offline is sent on reconnect and the share is not resumed', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  t.mgr.detach();
  t.mgr.stop('m1');
  const s2 = fakeSocket();
  t.mgr.attach(s2, ME);
  assert.deepEqual(s2.sent.filter((x) => x.ev === 'location.stop').map((x) => x.data), [{ messageId: 'm1' }]);
  s2.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  assert.deepEqual(t.mgr.activeIds(), []);
  assert.equal(s2.sent.filter((x) => x.ev === 'location.stop').length, 2, 're-sent when the server still lists it');
  s2.server('location.updated', { id: 'm1', metadata: { live: true, liveEnded: true } });
  const s3 = fakeSocket();
  t.mgr.attach(s3, ME);
  assert.equal(s3.sent.filter((x) => x.ev === 'location.stop').length, 0, 'forgotten once the server confirms');
});

test('pending stops survive a reload (kept in storage)', () => {
  const storage = memoryStorage();
  const clock = { t: 1_000_000 };
  const a = tab({ storage, clock });
  a.mgr.detach();
  a.mgr.stop('m9');
  const b = tab({ storage, clock, tabId: 'B' }); // a fresh page with the same storage
  assert.deepEqual(b.socket.sent.filter((x) => x.ev === 'location.stop').map((x) => x.data), [{ messageId: 'm9' }]);
});

test('reset (logout) stops GPS, the heartbeat and all tracking', () => {
  const t = tab();
  t.socket.server('location.active', [{ id: 'm1', liveUntil: until(t.clock, 600 * S) }]);
  assert.ok(t.geo.watching && t.ticking());
  t.mgr.reset();
  assert.deepEqual(t.mgr.activeIds(), []);
  assert.equal(t.geo.watching, null);
  assert.equal(t.ticking(), false);
  t.geo.move(1, 2);
  assert.equal(t.socket.updates().length, 0);
});

console.log(`\n${passed} passed`);
