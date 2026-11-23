// App-wide sender for the user's own live locations.
// Lives outside React so a share keeps updating while the user moves between
// chats, and resumes after a reload / reconnect (server sends `location.active`).
// All browser dependencies are injected — see liveLocationManager.test.mjs.
import { shouldSendUpdate, acquireLiveLock, releaseLiveLock } from './location.js';

const TICK_MS = 10 * 1000;        // heartbeat: refresh cross-tab lock, send while stationary
const STARTING_WINDOW_MS = 10 * 1000;
const FRESH_DEFER_MS = 5 * 1000;  // other tabs leave a just-started share to the tab that started it

export function createLiveLocationManager({ geolocation, storage, tabId, now = Date.now, setInterval, clearInterval }) {
  const shares = new Map(); // id -> { liveUntil: ms, last: {lat,lng,t}|null, deferUntil: ms }
  let socket = null;
  let userId = null;
  let listeners = [];
  let watchId = null;
  let timer = null;
  let fix = null; // latest {lat, lng, accuracy} from the device
  let startingUntil = 0;

  const lock = (id) => acquireLiveLock(storage, id, tabId, now());

  function untrack(id) {
    if (!shares.delete(String(id))) return;
    releaseLiveLock(storage, String(id), tabId);
    if (shares.size === 0) {
      if (watchId !== null) geolocation?.clearWatch(watchId);
      if (timer !== null) clearInterval(timer);
      watchId = null; timer = null; fix = null;
    }
  }

  function process() {
    const t = now();
    for (const [id, share] of [...shares]) {
      if (t >= share.liveUntil) { untrack(id); continue; }
      if (t < share.deferUntil || !lock(id) || !fix || !socket) continue;
      const next = { lat: fix.lat, lng: fix.lng, t };
      if (!shouldSendUpdate(share.last, next)) continue;
      socket.emit('location.update', { messageId: id, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
      share.last = next;
    }
  }

  function ensureRunning() {
    if (!geolocation) return;
    if (watchId === null) {
      watchId = geolocation.watchPosition(
        (pos) => {
          fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
          process();
        },
        () => { /* keep last fix; the bubble's "updated X ago" shows staleness */ },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
      );
    }
    if (timer === null) timer = setInterval(process, TICK_MS);
  }

  function track(id, liveUntil, { fresh = false, seed = null } = {}) {
    id = String(id);
    const until = new Date(liveUntil).getTime();
    if (!(until > now()) || shares.has(id)) return;
    const startedHere = fresh && now() < startingUntil;
    shares.set(id, {
      liveUntil: until,
      last: seed ? { lat: seed.lat, lng: seed.lng, t: now() } : null,
      deferUntil: fresh && !startedHere ? now() + FRESH_DEFER_MS : 0,
    });
    if (!fresh || startedHere) lock(id);
    ensureRunning();
  }

  const isOwnActiveLive = (m) => m && String(m.senderId) === String(userId) && m.type === 'location'
    && m.metadata?.live === true && !m.metadata.liveEnded;

  const on = {
    'location.active': (list) => {
      const ids = new Set((list || []).map((a) => String(a.id)));
      [...shares.keys()].forEach((id) => { if (!ids.has(id)) untrack(id); });
      (list || []).forEach((a) => track(a.id, a.liveUntil));
    },
    message: (m) => { if (isOwnActiveLive(m)) track(m.id, m.metadata.liveUntil, { fresh: true, seed: m.metadata }); },
    'group.message': (m) => { if (isOwnActiveLive(m)) track(m.id || m._id, m.metadata.liveUntil, { fresh: true, seed: m.metadata }); },
    'location.updated': (u) => { if (u?.metadata?.liveEnded) untrack(u.id); },
    'messages.deleted': (d) => { if (d?.id) untrack(d.id); },
    'group.message_deleted': (d) => { if (d?.messageId) untrack(d.messageId); },
  };

  return {
    attach(nextSocket, nextUserId) {
      this.detach();
      socket = nextSocket;
      userId = nextUserId;
      listeners = Object.entries(on);
      listeners.forEach(([ev, fn]) => socket.on(ev, fn));
    },
    detach() {
      if (socket) listeners.forEach(([ev, fn]) => socket.off(ev, fn));
      listeners = [];
      socket = null;
    },
    /** Call right before this tab sends a new live share. */
    markStarting() { startingUntil = now() + STARTING_WINDOW_MS; },
    stop(id) {
      socket?.emit('location.stop', { messageId: String(id) });
      untrack(id);
    },
    activeIds: () => [...shares.keys()],
  };
}
