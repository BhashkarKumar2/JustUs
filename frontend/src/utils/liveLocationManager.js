// App-wide sender for the user's own live locations.
// Lives outside React so a share keeps updating while the user moves between
// chats, and resumes after a reload / reconnect (server sends `location.active`).
// All browser dependencies are injected — see liveLocationManager.test.mjs.
import { shouldSendUpdate, acquireLiveLock, releaseLiveLock } from './location.js';

const TICK_MS = 10 * 1000;        // heartbeat: refresh cross-tab lock, send while stationary
const STARTING_WINDOW_MS = 10 * 1000;
const FRESH_DEFER_MS = 5 * 1000;  // other tabs leave a just-started share to the tab that started it
const STOPS_KEY = 'justus.liveStops';
const STOP_MEMORY_MS = 9 * 60 * 60 * 1000; // longer than the longest share

export function createLiveLocationManager({ geolocation, storage, tabId, deviceId = null, now = Date.now, setInterval, clearInterval }) {
  const shares = new Map(); // id -> { liveUntil: ms, last: {lat,lng,t}|null, deferUntil: ms }
  let socket = null;
  let userId = null;
  let listeners = [];
  let watchId = null;
  let timer = null;
  let fix = null; // latest {lat, lng, accuracy} from the device
  let startingUntil = 0;

  const lock = (id) => acquireLiveLock(storage, id, tabId, now());
  // only the device that started a share sends for it (older shares have no sourceId)
  const isMine = (sourceId) => !sourceId || !deviceId || sourceId === deviceId;

  // Stops the server hasn't confirmed yet (e.g. pressed while offline). Kept in storage so a
  // reload can't resume a share the user stopped.
  const readStops = () => {
    try {
      const all = JSON.parse(storage?.getItem(STOPS_KEY)) || {};
      return Object.fromEntries(Object.entries(all).filter(([, t]) => now() - t < STOP_MEMORY_MS));
    } catch { return {}; }
  };
  const writeStops = (stops) => { try { storage?.setItem(STOPS_KEY, JSON.stringify(stops)); } catch { /* ignore */ } };
  const sendStop = (id) => socket?.emit('location.stop', { messageId: String(id) });

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
      socket.emit('location.update', { messageId: id, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, ...(deviceId ? { sourceId: deviceId } : {}) });
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
      const stops = readStops();
      const ids = new Set((list || []).map((a) => String(a.id)));
      [...shares.keys()].forEach((id) => { if (!ids.has(id)) untrack(id); });
      (list || []).forEach((a) => {
        if (stops[String(a.id)]) sendStop(a.id); // still running server-side: stop it again
        else if (isMine(a.sourceId)) track(a.id, a.liveUntil);
      });
    },
    message: (m) => { if (isOwnActiveLive(m) && isMine(m.metadata.sourceId)) track(m.id, m.metadata.liveUntil, { fresh: true, seed: m.metadata }); },
    'group.message': (m) => { if (isOwnActiveLive(m) && isMine(m.metadata.sourceId)) track(m.id || m._id, m.metadata.liveUntil, { fresh: true, seed: m.metadata }); },
    'location.updated': (u) => {
      if (!u?.metadata?.liveEnded) return;
      untrack(u.id);
      const stops = readStops();
      if (stops[String(u.id)]) { delete stops[String(u.id)]; writeStops(stops); }
    },
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
      Object.keys(readStops()).forEach(sendStop); // stops that may not have reached the server
    },
    detach() {
      if (socket) listeners.forEach(([ev, fn]) => socket.off(ev, fn));
      listeners = [];
      socket = null;
    },
    /** Call right before this tab sends a new live share. */
    markStarting() { startingUntil = now() + STARTING_WINDOW_MS; },
    stop(id) {
      writeStops({ ...readStops(), [String(id)]: now() });
      sendStop(id);
      untrack(id);
    },
    activeIds: () => [...shares.keys()],
  };
}
