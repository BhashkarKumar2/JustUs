// Location sharing: validation and live-share lifecycle for messages of type 'location'.
import Message from '../models/Message.js';
import Group from '../models/Group.js';

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
  // the device that started a live share; only it may send updates
  if (typeof meta.sourceId === 'string' && meta.sourceId.length > 0 && meta.sourceId.length <= 64) metadata.sourceId = meta.sourceId;

  const until = meta.liveUntil ? new Date(meta.liveUntil) : null;
  if (!until || Number.isNaN(until.getTime())) return { ok: false, error: 'Live location needs an end time' };
  if (until <= now) return { ok: false, error: 'Live location end time is in the past' };
  if (until.getTime() - now.getTime() > LOCATION_LIMITS.maxLiveMs) return { ok: false, error: 'Live location is limited to 8 hours' };

  return { ok: true, metadata: { ...metadata, liveUntil: until, liveEnded: false } };
}

/** A plain pin built from any location metadata (used when forwarding). Null if the coordinates are invalid. */
export function toPinMetadata(meta, now = new Date()) {
  const pos = normalizePosition(meta);
  return pos ? { ...pos, live: false, updatedAt: now } : null;
}

// ---- Live share lifecycle -------------------------------------------------
// Every state change is a single conditional write, so a racing update, stop
// and expiry sweep can never revive an ended share or emit "ended" twice.


const ACTIVE_LIVE = { type: 'location', 'metadata.live': true, 'metadata.liveEnded': false, deleted: { $ne: true } };

/** Broadcast a location message's current metadata to everyone in its chat. */
export function emitLocationUpdated(io, message) {
  const payload = {
    id: String(message._id),
    conversationId: message.conversationId ? String(message.conversationId) : undefined,
    groupId: message.groupId ? String(message.groupId) : undefined,
    metadata: message.metadata,
  };
  if (message.groupId) {
    io.to(`group:${message.groupId}`).emit('location.updated', payload);
  } else {
    io.to(`user:${message.senderId}`).emit('location.updated', payload);
    io.to(`user:${message.receiverId}`).emit('location.updated', payload);
  }
}

/** End matching active live shares; emits once per share actually ended. Returns how many ended. */
export async function endLiveShares(io, filter) {
  const candidates = await Message.find({ ...filter, ...ACTIVE_LIVE }).select('_id');
  let ended = 0;
  for (const { _id } of candidates) {
    const doc = await Message.findOneAndUpdate(
      { _id, ...ACTIVE_LIVE },
      { $set: { 'metadata.liveEnded': true } },
      { new: true },
    );
    if (doc) {
      ended++;
      if (io) emitLocationUpdated(io, doc);
    }
  }
  return ended;
}

/**
 * Apply a sender's position update.
 * @returns {Promise<'updated'|'ended'|'ignored'>}
 */
export async function applyLocationUpdate(io, messageId, userId, position, now = new Date()) {
  const pos = normalizePosition(position);
  if (!pos) return 'ignored';

  const current = await Message.findOne({ _id: messageId, senderId: userId, ...ACTIVE_LIVE });
  if (!current) return 'ignored';
  if (current.groupId && !(await Group.exists({ _id: current.groupId, members: userId }))) return 'ignored';
  if (current.metadata.sourceId && current.metadata.sourceId !== position?.sourceId) return 'ignored';

  if (!(new Date(current.metadata.liveUntil) > now)) {
    return (await endLiveShares(io, { _id: current._id })) ? 'ended' : 'ignored';
  }

  const doc = await Message.findOneAndUpdate(
    { _id: current._id, ...ACTIVE_LIVE, 'metadata.liveUntil': { $gt: now } },
    { $set: { 'metadata.lat': pos.lat, 'metadata.lng': pos.lng, 'metadata.accuracy': pos.accuracy, 'metadata.updatedAt': now } },
    { new: true },
  );
  if (!doc) return 'ignored';
  emitLocationUpdated(io, doc);
  return 'updated';
}

/** Sender stops their own live share. */
export function stopLiveShare(io, messageId, userId) {
  return endLiveShares(io, { _id: messageId, senderId: userId });
}

/** Periodically end overdue live shares, even if the sender's app is gone. Returns a stop function. */
export function startLocationSweep(io, intervalMs = 60000) {
  const timer = setInterval(() => {
    endLiveShares(io, { 'metadata.liveUntil': { $lte: new Date() } })
      .catch((err) => console.error('Error handling location sweep:', err.message));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** The user's own live shares that are still running: [{id, liveUntil}]. */
export async function activeLiveShares(userId, now = new Date()) {
  const docs = await Message.find({ senderId: userId, ...ACTIVE_LIVE, 'metadata.liveUntil': { $gt: now } })
    .select('_id metadata.liveUntil metadata.sourceId').lean();
  return docs.map((d) => ({ id: String(d._id), liveUntil: d.metadata.liveUntil, sourceId: d.metadata.sourceId || null }));
}
