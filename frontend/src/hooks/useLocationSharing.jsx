import { useCallback, useState } from 'react';
import { toast } from 'react-hot-toast';
import { geolocationErrorMessage } from '../utils/location';
import { liveLocation } from '../services/liveLocation';

const CONTENT = { pin: '📍 Location', live: '📍 Live location' };

function currentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

/**
 * Compose-bar actions for sharing location in one chat.
 * chat: { kind: 'dm', receiverId, conversationId } | { kind: 'group', groupId }
 */
export function useLocationSharing({ socket, chat }) {
  const [busy, setBusy] = useState(false);
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation
    && (typeof window === 'undefined' || window.isSecureContext !== false);

  const share = useCallback(async (liveMs) => {
    if (!supported) {
      toast.error(geolocationErrorMessage({ code: 1 }));
      return;
    }
    if (!socket?.connected) {
      toast.error('Not connected — try again in a moment');
      return;
    }
    setBusy(true);
    try {
      const pos = await currentPosition();
      const metadata = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        live: !!liveMs,
        ...(liveMs ? { liveUntil: new Date(Date.now() + liveMs).toISOString() } : {}),
      };
      const content = liveMs ? CONTENT.live : CONTENT.pin;
      if (liveMs) liveLocation.markStarting();
      if (chat.kind === 'group') {
        socket.emit('group.send', { groupId: chat.groupId, type: 'location', content, metadata });
      } else {
        socket.emit('chat.send', { receiverId: chat.receiverId, conversationId: chat.conversationId, type: 'location', content, metadata });
      }
    } catch (err) {
      toast.error(geolocationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [supported, socket, chat.kind, chat.groupId, chat.receiverId, chat.conversationId]);

  const sendCurrentLocation = useCallback(() => share(0), [share]);
  const startLiveLocation = useCallback((durationMs) => share(durationMs), [share]);
  const stopLiveLocation = useCallback((messageId) => liveLocation.stop(messageId), []);

  return { sendCurrentLocation, startLiveLocation, stopLiveLocation, supported, busy };
}
