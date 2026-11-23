/**
 * Tests for location-sharing helpers.
 * Standalone (no test runner):  node src/utils/location.test.mjs
 */
import assert from 'node:assert/strict';
import {
  distanceMeters, shouldSendUpdate, mapsUrl, liveStatus, formatLiveCaption,
  geolocationErrorMessage, acquireLiveLock, LIVE_LOCK_STALE_MS, applyLocationUpdate,
} from './location.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const S = 1000;
const MIN = 60 * S;

test('distance Bengaluru -> Mysuru is about 127 km', () => {
  const d = distanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.2958, lng: 76.6394 });
  assert.ok(Math.abs(d - 127000) < 2000, `got ${d}`);
});

test('distance to the same point is 0', () => {
  assert.equal(distanceMeters({ lat: 1, lng: 2 }, { lat: 1, lng: 2 }), 0);
});

// 0.0001 deg latitude is ~11.1 m
const at = (dLatDeg, tMs) => ({ lat: 10 + dLatDeg, lng: 20, t: tMs });
test('first update is always sent', () => assert.equal(shouldSendUpdate(null, at(0, 0)), true));
test('not sent within 15 s even after a big move', () => assert.equal(shouldSendUpdate(at(0, 0), at(0.0045, 10 * S)), false));
test('not sent after 20 s when moved only ~5 m', () => assert.equal(shouldSendUpdate(at(0, 0), at(0.000045, 20 * S)), false));
test('sent after 20 s when moved ~25 m', () => assert.equal(shouldSendUpdate(at(0, 0), at(0.000225, 20 * S)), true));
test('sent after 65 s without moving', () => assert.equal(shouldSendUpdate(at(0, 0), at(0, 65 * S)), true));

test('maps link', () => assert.equal(mapsUrl(1.5, -2.25), 'https://www.google.com/maps?q=1.5,-2.25'));

const NOW = new Date(2026, 10, 23, 18, 0, 0); // local time, 6:00 PM
const liveMeta = (over = {}) => ({
  lat: 1, lng: 2, accuracy: 20, live: true, liveEnded: false,
  liveUntil: new Date(NOW.getTime() + 40 * MIN).toISOString(),
  updatedAt: new Date(NOW.getTime() - 1 * MIN).toISOString(), ...over,
});

test('status: pin', () => assert.equal(liveStatus({ lat: 1, lng: 2, live: false }, NOW), 'pin'));
test('status: live', () => assert.equal(liveStatus(liveMeta(), NOW), 'live'));
test('status: ended by stop', () => assert.equal(liveStatus(liveMeta({ liveEnded: true }), NOW), 'ended'));
test('status: ended when liveUntil is past even if liveEnded is false', () => {
  assert.equal(liveStatus(liveMeta({ liveUntil: new Date(NOW.getTime() - S).toISOString() }), NOW), 'ended');
});
test('status: missing metadata is a pin', () => assert.equal(liveStatus(null, NOW), 'pin'));

test('caption: precise pin', () => assert.equal(formatLiveCaption({ lat: 1, lng: 2, accuracy: 30, live: false }, NOW), '📍 Location'));
test('caption: imprecise pin shows accuracy', () => assert.equal(formatLiveCaption({ lat: 1, lng: 2, accuracy: 1234.4, live: false }, NOW), '📍 Location · ± 1234 m'));
test('caption: live', () => assert.equal(formatLiveCaption(liveMeta(), NOW), '🟢 Live · until 6:40 PM · updated 1 min ago'));
test('caption: live, just updated, morning end', () => {
  const m = liveMeta({ liveUntil: new Date(2026, 10, 24, 0, 5).toISOString(), updatedAt: NOW.toISOString() });
  assert.equal(formatLiveCaption(m, NOW), '🟢 Live · until 12:05 AM · updated just now');
});
test('caption: live, stale for hours', () => {
  const m = liveMeta({ liveUntil: new Date(NOW.getTime() + 5 * 60 * MIN).toISOString(), updatedAt: new Date(NOW.getTime() - 125 * MIN).toISOString() });
  assert.equal(formatLiveCaption(m, NOW), '🟢 Live · until 11:00 PM · updated 2 h ago');
});
test('caption: ended', () => assert.equal(formatLiveCaption(liveMeta({ liveEnded: true }), NOW), 'Live location ended'));

const OFF = 'Location is off — enable it in your browser / Windows settings';
test('error: permission denied', () => assert.equal(geolocationErrorMessage({ code: 1 }), OFF));
test('error: unavailable', () => assert.equal(geolocationErrorMessage({ code: 2 }), OFF));
test('error: timeout', () => assert.equal(geolocationErrorMessage({ code: 3 }), "Couldn't get your location in time — try again"));

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
test('live lock: one tab at a time, stale locks can be taken over', () => {
  const st = memoryStorage();
  assert.equal(acquireLiveLock(st, 'm1', 'tabA', 0), true);
  assert.equal(acquireLiveLock(st, 'm1', 'tabB', 10 * S), false);
  assert.equal(acquireLiveLock(st, 'm1', 'tabA', 10 * S), true); // refresh own
  assert.equal(acquireLiveLock(st, 'm1', 'tabB', 10 * S + LIVE_LOCK_STALE_MS - 1), false);
  assert.equal(acquireLiveLock(st, 'm1', 'tabB', 10 * S + LIVE_LOCK_STALE_MS + 1), true);
  assert.equal(acquireLiveLock(st, 'm2', 'tabA', 0), true); // locks are per message
});
test('live lock: corrupt value is treated as free', () => {
  const st = memoryStorage();
  st.setItem('justus.liveLock.m1', '{not json');
  assert.equal(acquireLiveLock(st, 'm1', 'tabA', 0), true);
});
test('live lock stale window is 30 s', () => assert.equal(LIVE_LOCK_STALE_MS, 30 * S));

console.log(`\n${passed} passed`);
