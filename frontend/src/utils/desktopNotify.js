/**
 * Bridge to the JustUs desktop app (Electron shell in /desktop).
 *
 * The web app's notifications rely on Web Push, which Electron doesn't support.
 * When running inside the desktop app, `window.justusDesktop` exists and we hand
 * incoming messages/calls to the shell, which shows native Windows toasts and the
 * taskbar unread badge (only while the window isn't focused).
 * In a normal browser `window.justusDesktop` is undefined and this is a no-op.
 */

const MEDIA_LABELS = {
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎤 Voice message',
  voice: '🎤 Voice message',
  file: '📎 File',
  document: '📎 Document',
  pdf: '📎 Document',
  call: '📞 Call',
};

export function isDesktopApp() {
  return typeof window !== 'undefined' && !!window.justusDesktop?.isDesktop;
}

/** Read the user id from a JWT without verifying it (display-only use). */
export function getUserIdFromToken(token) {
  try {
    const part = String(token).split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return json.userId ? String(json.userId) : null;
  } catch {
    return null;
  }
}

function messageBody(data) {
  if (MEDIA_LABELS[data.type]) return MEDIA_LABELS[data.type];
  // End-to-end encrypted content is ciphertext at this layer; don't show it.
  if (data.encryptionNonce || data.ciphertext) return '🔒 New message';
  const text = typeof data.content === 'string' ? data.content.trim() : '';
  return text || 'New message';
}

/**
 * Build the notification payload for a socket event, or null if none should be shown.
 * @param {'message'|'group.message'|'call.offer'|'video-call.offer'|'call.end'|'video-call.end'} event
 */
export function buildDesktopNotification(event, data, myUserId) {
  if (!data || typeof data !== 'object') return null;
  const senderId = data.senderId != null ? String(data.senderId) : null;
  if (myUserId && senderId === String(myUserId)) return null; // my own echo

  // caller hung up: tell the shell to remove the ringing toast
  if (event === 'call.end' || event === 'video-call.end') return { kind: 'call-ended', title: '' };

  if (event === 'call.offer' || event === 'video-call.offer') {
    const video = event === 'video-call.offer';
    return {
      kind: 'call',
      title: `Incoming ${video ? 'video' : 'voice'} call`,
      body: `${data.callerName || 'Someone'} is calling you`,
    };
  }

  if (event === 'message' || event === 'group.message') {
    if (!data.id || data.temporary || data.deleted) return null;
    if (typeof data.type === 'string' && data.type.startsWith('system:')) return null;
    const sender = data.senderDisplayName || data.senderUsername || 'New message';
    return {
      kind: 'message',
      title: sender,
      body: messageBody(data),
    };
  }

  return null;
}

/** Forward a socket event to the desktop shell if we're running in it. */
export function notifyDesktop(event, data, myUserId) {
  if (!isDesktopApp()) return;
  try {
    const payload = buildDesktopNotification(event, data, myUserId);
    if (payload) window.justusDesktop.notify(payload);
  } catch (e) {
    console.warn('[desktop] notify failed', e);
  }
}
