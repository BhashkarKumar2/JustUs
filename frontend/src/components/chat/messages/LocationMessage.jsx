import React, { useEffect, useRef, useState } from 'react';
import { formatLiveCaption, liveStatus, mapsUrl } from '../../../utils/location';
import { liveLocation } from '../../../services/liveLocation';

const ZOOM = 15;
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

let leafletPromise = null;
const loadLeaflet = () => {
  leafletPromise ||= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => mod.default || mod);
  return leafletPromise;
};

/** Small, non-interactive map of the point; tap opens Google Maps. */
function MiniMap({ lat, lng, dimmed }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current, {
        zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false, tap: false, attributionControl: true,
      }).setView([lat, lng], ZOOM);
      map.current.attributionControl?.setPrefix(false);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      marker.current = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map.current);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // created once; position changes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    map.current.setView([lat, lng], map.current.getZoom());
    marker.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 200, background: '#e5e7eb' }}>
      {failed ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 32 }}>📍</div>
      ) : (
        <div ref={el} style={{ width: '100%', height: '100%', filter: dimmed ? 'grayscale(1)' : 'none', opacity: dimmed ? 0.6 : 1 }} />
      )}
      <a
        href={mapsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open location in Google Maps"
        title="Open in Google Maps"
        style={{ position: 'absolute', inset: 0, zIndex: 500 }}
      />
    </div>
  );
}

const stopViaManager = (id) => liveLocation.stop(id);

export default function LocationMessage({ message, mine, onStopLive = stopViaManager, theme }) {
  const meta = message.metadata || {};
  const [now, setNow] = useState(() => new Date());
  const status = liveStatus(meta, now);
  const dark = theme === 'dark';

  // keep "updated X min ago" fresh, and flip to ended at the end time even if the server is quiet
  useEffect(() => {
    if (status !== 'live') return undefined;
    const tick = setInterval(() => setNow(new Date()), 30000);
    const untilMs = new Date(meta.liveUntil).getTime() - Date.now();
    const end = setTimeout(() => setNow(new Date()), Math.max(0, untilMs) + 500);
    return () => { clearInterval(tick); clearTimeout(end); };
  }, [status, meta.liveUntil]);

  const valid = typeof meta.lat === 'number' && typeof meta.lng === 'number';
  if (!valid) return <span>{message.content || '📍 Location'}</span>;

  return (
    <div
      data-testid="location-message"
      data-status={status}
      style={{
        width: 'min(260px, 70vw)', borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`, background: dark ? '#1f2937' : '#fff',
        color: dark ? '#e5e7eb' : '#111827',
      }}
    >
      <MiniMap lat={meta.lat} lng={meta.lng} dimmed={status === 'ended'} />
      <div style={{ padding: '8px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ color: status === 'ended' ? (dark ? '#9ca3af' : '#6b7280') : 'inherit' }}>{formatLiveCaption(meta, now)}</span>
        {mine && status === 'live' && onStopLive && (
          <button
            type="button"
            onClick={() => onStopLive(String(message.id ?? message._id))}
            style={{ flexShrink: 0, border: 'none', borderRadius: 8, padding: '4px 10px', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Stop sharing
          </button>
        )}
      </div>
    </div>
  );
}
