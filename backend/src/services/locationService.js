// Location sharing: validation and live-share lifecycle for messages of type 'location'.

export const LOCATION_LIMITS = {
  maxLiveMs: 8 * 60 * 60 * 1000, // longest live share
};

export const LOCATION_CONTENT = {
  pin: '📍 Location',
  live: '📍 Live location',
};

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const isCoord = (n, max) => typeof n === 'number' && Number.isFinite(n) && n >= -max && n <= max;

/** Validate lat/lng(/accuracy) coming from a client. Returns normalized values or null. */
export function normalizePosition(p) {
  if (!p || typeof p !== 'object') return null;
  if (!isCoord(p.lat, 90) || !isCoord(p.lng, 180)) return null;
  const accuracy = typeof p.accuracy === 'number' && Number.isFinite(p.accuracy) && p.accuracy >= 0
    ? Math.round(p.accuracy) : null;
  return { lat: round6(p.lat), lng: round6(p.lng), accuracy };
}

/**
 * Validate and normalize the metadata of a new location message.
 * @returns {{ok: true, metadata: object} | {ok: false, error: string}}
 */
export function validateLocationMetadata(meta, now = new Date()) {
  const pos = normalizePosition(meta);
  if (!pos) return { ok: false, error: 'Invalid coordinates' };

  const metadata = { ...pos, live: meta.live === true, updatedAt: now };
  if (!metadata.live) return { ok: true, metadata };

  const until = meta.liveUntil ? new Date(meta.liveUntil) : null;
  if (!until || Number.isNaN(until.getTime())) return { ok: false, error: 'Live location needs an end time' };
  if (until <= now) return { ok: false, error: 'Live location end time is in the past' };
  if (until.getTime() - now.getTime() > LOCATION_LIMITS.maxLiveMs) return { ok: false, error: 'Live location is limited to 8 hours' };

  return { ok: true, metadata: { ...metadata, liveUntil: until, liveEnded: false } };
}
