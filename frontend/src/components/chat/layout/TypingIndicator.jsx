import React from 'react';

export default function TypingIndicator({ typingUser, colors }) {
  if (!typingUser) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px' }}>
      <div style={{ background: colors?.bubbleIn || '#dcf8c6', borderRadius: '12px', padding: '8px 12px', minWidth: '60px' }}>
        <div style={{ fontSize: '0.75rem', color: colors?.timestamp || '#999', marginBottom: '4px' }}>
          {typingUser} is typing
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <div style={{ width: '8px', height: '8px', background: colors?.timestamp || '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite' }}></div>
          <div style={{ width: '8px', height: '8px', background: colors?.timestamp || '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite', animationDelay: '0.2s' }}></div>
          <div style={{ width: '8px', height: '8px', background: colors?.timestamp || '#999', borderRadius: '50%', animation: 'bounce 1.4s infinite', animationDelay: '0.4s' }}></div>
        </div>
      </div>
      
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
