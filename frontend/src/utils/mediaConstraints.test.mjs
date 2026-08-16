/**
 * Tests for call media constraints.
 *
 * The frontend has no test runner configured, so this runs standalone:
 *   node src/utils/mediaConstraints.test.mjs
 *
 * Regression under test: bare numeric width/height are *exact* constraints and
 * make the browser center-crop a portrait phone camera into a landscape frame
 * at capture time. The crop is encoded into the outgoing stream, so the remote
 * peer sees a zoomed image that no CSS can undo.
 */

import assert from 'node:assert/strict';
import {
  buildVideoConstraints,
  buildAudioConstraints,
  buildCallConstraints
} from './mediaConstraints.js';

let passed = 0;
let failed = 0;

const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
    failed++;
  }
};

console.log('\nvideo constraints');

test('width is a range, not an exact number', () => {
  const { video } = buildVideoConstraints();
  assert.equal(
    typeof video.width,
    'object',
    'width must be an object like { ideal: 640 } - a bare number is an exact constraint and crops'
  );
  assert.equal(video.width.ideal, 640);
});

test('height is a range, not an exact number', () => {
  const { video } = buildVideoConstraints();
  assert.equal(
    typeof video.height,
    'object',
    'height must be an object like { ideal: 480 } - a bare number is an exact constraint and crops'
  );
  assert.equal(video.height.ideal, 480);
});

test('no exact/min/max keys that would force an aspect ratio', () => {
  const { video } = buildVideoConstraints();
  for (const dimension of ['width', 'height']) {
    const keys = Object.keys(video[dimension]);
    assert.deepEqual(
      keys,
      ['ideal'],
      `${dimension} must only specify 'ideal'; found: ${keys.join(', ')}`
    );
  }
});

test('does not pin aspectRatio', () => {
  const { video } = buildVideoConstraints();
  assert.equal(
    video.aspectRatio,
    undefined,
    'pinning aspectRatio reintroduces the crop this fix removes'
  );
});

test('requests the front camera', () => {
  assert.equal(buildVideoConstraints().video.facingMode, 'user');
});

test('requests audio alongside video', () => {
  assert.equal(buildVideoConstraints().audio, true);
});

console.log('\naudio constraints');

test('disables video entirely', () => {
  assert.equal(buildAudioConstraints().video, false);
});

test('keeps the voice-call audio processing', () => {
  const { audio } = buildAudioConstraints();
  assert.equal(audio.echoCancellation, true);
  assert.equal(audio.noiseSuppression, true);
  assert.equal(audio.autoGainControl, true);
});

console.log('\nconstraint selection by call type');

test("'video' produces video constraints", () => {
  assert.notEqual(buildCallConstraints('video').video, false);
});

test("'audio' produces audio-only constraints", () => {
  assert.equal(buildCallConstraints('audio').video, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
