// Pure helpers for location sharing (no React, no browser APIs) — see utils/location.test.mjs.

const EARTH_RADIUS_M = 6371000;
const MIN_UPDATE_GAP_MS = 15 * 1000;   // never send more often than this
const MIN_MOVE_M = 20;                 // ...and only after moving this far
const MAX_SILENCE_MS = 60 * 1000;      // ...or after this long anyway
export const LIVE_LOCK_STALE_MS = 30 * 1000;

export const LIVE_DURATIONS = [
  { label: '15 minutes', ms: 15 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '8 hours', ms: 8 * 60 * 60 * 1000 },
];

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Throttle for live updates: last/next are {lat, lng, t(ms)}. */
export function shouldSendUpdate(last, next) {
  if (!last) return true;
  const elapsed = next.t - last.t;
  if (elapsed < MIN_UPDATE_GAP_MS) return false;
  return elapsed >= MAX_SILENCE_MS || distanceMeters(last, next) >= MIN_MOVE_M;
}

export const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

/** 'pin' | 'live' | 'ended' — a live share past its end time counts as ended even before the server says so. */
export function liveStatus(metadata, now = new Date()) {
  if (!metadata?.live) return 'pin';
  if (metadata.liveEnded) return 'ended';
  return new Date(metadata.liveUntil) > now ? 'live' : 'ended';
}

function clockTime(date) {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function ago(date, now) {
  const mins = Math.floor((now - date) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ago`;
}

/** Caption under the map bubble. */
export function formatLiveCaption(metadata, now = new Date()) {
  const status = liveStatus(metadata, now);
  if (status === 'ended') return 'Live location ended';
  if (status === 'live') {
    return `🟢 Live · until ${clockTime(new Date(metadata.liveUntil))} · updated ${ago(new Date(metadata.updatedAt), now)}`;
  }
  const acc = metadata?.accuracy;
  return typeof acc === 'number' && acc > 100 ? `📍 Location · ± ${Math.round(acc)} m` : '📍 Location';
}

/** Toast text for a GeolocationPositionError. */
export function geolocationErrorMessage(err) {
  if (err?.code === 3) return "Couldn't get your location in time — try again";
  return 'Location is off — enable it in your browser / Windows settings';
}

/**
 * Cross-tab lock so only one tab sends updates for a live share.
 * Returns true if this tab holds (or just took / refreshed) the lock.
 */
export function acquireLiveLock(storage, messageId, tabId, now = Date.now()) {
  const key = `justus.liveLock.${messageId}`;
  let held = null;
  try { held = JSON.parse(storage.getItem(key)); } catch { held = null; }
  if (held && held.tabId !== tabId && now - held.t <= LIVE_LOCK_STALE_MS) return false;
  storage.setItem(key, JSON.stringify({ tabId, t: now }));
  return true;
}

export function releaseLiveLock(storage, messageId, tabId) {
  const key = `justus.liveLock.${messageId}`;
  try {
    if (JSON.parse(storage.getItem(key))?.tabId === tabId) storage.removeItem(key);
  } catch { /* ignore */ }
}

/** Patch a message list with a `location.updated` event; same array back if the message isn't in it. */
export function applyLocationUpdate(list, event) {
  if (!event?.id) return list;
  const id = String(event.id);
  const i = list.findIndex((m) => String(m.id ?? m._id) === id);
  if (i === -1) return list;
  const next = list.slice();
  next[i] = { ...list[i], metadata: { ...list[i].metadata, ...event.metadata } };
  return next;
}

/** What to send when forwarding a location: always a pin of its last point, never a live share. */
export function forwardedLocation(metadata) {
  return {
    content: '📍 Location',
    metadata: { lat: metadata?.lat, lng: metadata?.lng, accuracy: metadata?.accuracy ?? null, live: false },
  };
}
