import React, { useEffect, useRef } from 'react';
import { getAvatarUrl } from '../../services/avatarService';

export default function VoiceCallModal({
  callState,
  incomingCall,
  callDuration,
  otherUser,
  onAnswer,
  onReject,
  onEnd,
  localStreamRef,
  remoteStreamRef,
  colors
}) {
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Format call duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Set up audio streams
  useEffect(() => {
    if (localAudioRef.current && localStreamRef.current) {
      localAudioRef.current.srcObject = localStreamRef.current;
      localAudioRef.current.muted = true; // Mute local audio to prevent echo
    }
  }, [localStreamRef.current]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef.current]);

  if (callState === 'idle') return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: colors?.chatBg || '#fff',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Avatar */}
        <div style={{
          width: '120px',
          height: '120px',
          margin: '0 auto 24px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '4px solid ' + (colors?.sendBtn || '#25d366')
        }}>
          <img
            src={getAvatarUrl(otherUser?.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser?.displayName || otherUser?.username || 'User')}&size=120&background=6366f1&color=ffffff&bold=true`}
            alt=""
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser?.displayName || otherUser?.username || 'User')}&size=120&background=6366f1&color=ffffff&bold=true`;
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#6366f1' }}
          />
        </div>

        {/* User name */}
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: colors?.headerText || '#222',
          marginBottom: '8px'
        }}>
          {otherUser?.displayName || otherUser?.username || 'User'}
        </h3>

        {/* Call status */}
        {callState === 'calling' && (
          <div>
            <p style={{ color: colors?.timestamp || '#666', marginBottom: '32px' }}>
              Calling...
            </p>
            <div style={{
              width: '60px',
              height: '60px',
              margin: '0 auto 32px',
              border: '4px solid ' + (colors?.sendBtn || '#25d366'),
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        )}

        {callState === 'ringing' && incomingCall && (
          <div>
            <p style={{ color: colors?.timestamp || '#666', marginBottom: '32px' }}>
              Incoming voice call...
            </p>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                background: colors?.sendBtn || '#25d366',
                borderRadius: '50%',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}></div>
              <div style={{
                width: '12px',
                height: '12px',
                background: colors?.sendBtn || '#25d366',
                borderRadius: '50%',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: '0.2s'
              }}></div>
              <div style={{
                width: '12px',
                height: '12px',
                background: colors?.sendBtn || '#25d366',
                borderRadius: '50%',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: '0.4s'
              }}></div>
            </div>
          </div>
        )}

        {callState === 'connected' && (
          <div>
            <p style={{
              color: colors?.sendBtn || '#25d366',
              fontWeight: 'bold',
              marginBottom: '8px'
            }}>
              Connected
            </p>
            <p style={{
              fontSize: '1.25rem',
              color: colors?.timestamp || '#666',
              marginBottom: '32px',
              fontFamily: 'monospace'
            }}>
              {formatDuration(callDuration)}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center'
        }}>
          {callState === 'ringing' && incomingCall && (
            <>
              <button
                onClick={onAnswer}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '64px',
                  height: '64px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                title="Answer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
              </button>
              <button
                onClick={onReject}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '64px',
                  height: '64px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                title="Reject"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '32px', height: '32px', transform: 'rotate(135deg)' }}>
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
              </button>
            </>
          )}

          {(callState === 'calling' || callState === 'connected') && (
            <button
              onClick={onEnd}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '64px',
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              title="End call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '32px', height: '32px', transform: 'rotate(135deg)' }}>
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
          )}
        </div>

        {/* Hidden audio elements */}
        <audio ref={localAudioRef} autoPlay muted style={{ display: 'none' }} />
        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      </div>
    </div>
  );
}
