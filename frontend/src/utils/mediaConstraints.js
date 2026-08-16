/**
 * getUserMedia constraint builders for calls.
 *
 * Video constraints must be expressed as `ideal`, never as bare numbers.
 * A bare `{ width: 640, height: 480 }` is an *exact* constraint: the browser
 * is required to produce that resolution, and when the camera's native output
 * does not match that aspect ratio it satisfies the request by cropping.
 *
 * A phone held in portrait produces a portrait stream. Forcing it into a
 * 640x480 landscape frame center-crops the image at capture time, so the
 * cropped frame is what gets encoded and sent. No amount of `object-fit` on
 * the receiving end can recover pixels that were never transmitted.
 *
 * With `ideal`, the browser picks the closest natively supported mode and
 * sends the full frame, letting the remote `object-fit: contain` letterbox it.
 */

const IDEAL_WIDTH = 640;
const IDEAL_HEIGHT = 480;

/**
 * Video constraints for a video call.
 * `facingMode: 'user'` selects the front camera on mobile, which is otherwise
 * left to browser default.
 */
export const buildVideoConstraints = () => ({
  audio: true,
  video: {
    width: { ideal: IDEAL_WIDTH },
    height: { ideal: IDEAL_HEIGHT },
    facingMode: 'user'
  }
});

/**
 * Audio-only constraints for a voice call.
 */
export const buildAudioConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: false
});

/**
 * Constraints for a call of the given type.
 * @param {'video'|'audio'} type
 */
export const buildCallConstraints = (type) =>
  type === 'video' ? buildVideoConstraints() : buildAudioConstraints();
