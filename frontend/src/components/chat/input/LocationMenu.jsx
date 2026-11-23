import React, { useEffect, useRef, useState } from 'react';
import { LIVE_DURATIONS } from '../../../utils/location';

/** Popover above the 📍 button: send a pin, or pick a live-share duration. */
export default function LocationMenu({ onSendCurrent, onStartLive, onClose, colors }) {
  const ref = useRef(null);
  const [step, setStep] = useState('main');

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const item = (label, onClick, key) => (
    <button
      key={key || label}
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: colors.inputText, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.inputBorder; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Share location"
      style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 1000, minWidth: 220,
        background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)', backdropFilter: 'blur(12px)', overflow: 'hidden',
      }}
    >
      {step === 'main' ? (
        <>
          {item('📍 Send current location', () => { onClose(); onSendCurrent(); })}
          {item('🟢 Share live location', () => setStep('live'))}
        </>
      ) : (
        <>
          <div style={{ padding: '8px 14px 4px', fontSize: 12, opacity: 0.7, color: colors.inputText }}>Share live location for</div>
          {LIVE_DURATIONS.map((d) => item(d.label, () => { onClose(); onStartLive(d.ms); }, d.ms))}
        </>
      )}
    </div>
  );
}
