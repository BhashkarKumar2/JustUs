/**
 * Tests for the desktop-app notification bridge.
 * Standalone (no test runner):  node src/utils/desktopNotify.test.mjs
 */
import assert from 'node:assert/strict';
import { buildDesktopNotification, getUserIdFromToken, notifyDesktop } from './desktopNotify.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const ME = 'u-me';

test('direct text message from someone else', () => {
  assert.deepEqual(
    buildDesktopNotification('message', { id: 'm1', senderId: 'u-a', senderDisplayName: 'Asha', type: 'text', content: ' hi there ' }, ME),
    { kind: 'message', title: 'Asha', body: 'hi there' });
});

test('own echoed message is ignored', () => {
  assert.equal(buildDesktopNotification('message', { id: 'm1', senderId: ME, content: 'x' }, ME), null);
});

test('encrypted content is never shown', () => {
  const n = buildDesktopNotification('message', { id: 'm1', senderId: 'u-a', senderUsername: 'asha', type: 'text', content: 'Zm9vYmFy', encryptionNonce: 'abc' }, ME);
  assert.equal(n.body, '🔒 New message');
  assert.equal(n.title, 'asha');
});

test('media messages get a label', () => {
  assert.equal(buildDesktopNotification('message', { id: 'm', senderId: 'u-a', type: 'audio' }, ME).body, '🎤 Voice message');
  assert.equal(buildDesktopNotification('group.message', { id: 'm', senderId: 'u-a', type: 'image' }, ME).body, '📷 Photo');
});

test('temporary / deleted / id-less / system messages are ignored', () => {
  assert.equal(buildDesktopNotification('message', { id: 'm', senderId: 'u-a', temporary: true }, ME), null);
  assert.equal(buildDesktopNotification('message', { id: 'm', senderId: 'u-a', deleted: true }, ME), null);
  assert.equal(buildDesktopNotification('message', { senderId: 'u-a', content: 'x' }, ME), null);
  assert.equal(buildDesktopNotification('message', { id: 'm', senderId: 'u-a', type: 'system:join' }, ME), null);
});

test('incoming voice and video calls', () => {
  assert.deepEqual(buildDesktopNotification('call.offer', { senderId: 'u-a', callerName: 'asha', offer: {} }, ME),
    { kind: 'call', title: 'Incoming voice call', body: 'asha is calling you' });
  assert.equal(buildDesktopNotification('video-call.offer', { senderId: 'u-a' }, ME).title, 'Incoming video call');
});

test('call end from the other side clears the ringing toast', () => {
  assert.equal(buildDesktopNotification('call.end', { senderId: 'u-a' }, ME).kind, 'call-ended');
  assert.equal(buildDesktopNotification('video-call.end', { senderId: 'u-a' }, ME).kind, 'call-ended');
});

test('unknown events and junk data are ignored', () => {
  assert.equal(buildDesktopNotification('typing', { id: 'm', senderId: 'u-a' }, ME), null);
  assert.equal(buildDesktopNotification('message', null, ME), null);
});

test('getUserIdFromToken reads the userId claim; bad tokens give null', () => {
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(getUserIdFromToken(`${b64url({ alg: 'HS256' })}.${b64url({ userId: 'abc123', username: 'x' })}.sig`), 'abc123');
  assert.equal(getUserIdFromToken('garbage'), null);
  assert.equal(getUserIdFromToken(undefined), null);
});

test('notifyDesktop is a no-op outside the desktop app, forwards inside it', () => {
  globalThis.window = {};
  notifyDesktop('message', { id: 'm', senderId: 'u-a', content: 'x' }, ME); // must not throw
  const sent = [];
  globalThis.window = { justusDesktop: { isDesktop: true, notify: (p) => sent.push(p) } };
  notifyDesktop('message', { id: 'm', senderId: 'u-a', content: 'x' }, ME);
  notifyDesktop('message', { id: 'm', senderId: ME, content: 'x' }, ME);
  assert.equal(sent.length, 1);
  delete globalThis.window;
});

console.log(`\n${passed} passed`);
