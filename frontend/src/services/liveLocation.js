// Browser wiring for the app-wide live-location sender (see utils/liveLocationManager.js).
import { createLiveLocationManager } from '../utils/liveLocationManager';
import { getUserIdFromToken } from '../utils/desktopNotify';
import { getSocket, subscribeSocket } from './socket';

const hasWindow = typeof window !== 'undefined';

export const liveLocation = createLiveLocationManager({
  geolocation: hasWindow && navigator.geolocation ? navigator.geolocation : null,
  storage: hasWindow ? window.localStorage : null,
  tabId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  now: () => Date.now(),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
});

let attached = null;
function follow() {
  const s = getSocket();
  if (s === attached) return;
  attached = s;
  if (s) liveLocation.attach(s, getUserIdFromToken(localStorage.getItem('token')));
  else liveLocation.detach();
}

if (hasWindow) {
  subscribeSocket(follow);
  follow();
}
