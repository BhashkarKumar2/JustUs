import React, { useEffect, useRef } from 'react';
import { getAvatarUrl } from '../../services/avatarService';

export default function VideoCallModal({
  callState,
  incomingCall,
  callDuration,
  otherUser,
  isMuted,
  isVideoOff,
  onAnswer,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
  localStream,
  remoteStream,
  colors
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Format call duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Set up video streams
  useEffect(() => {
    // Attach local stream whenever available
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream || null;
    }
    // Attach remote stream whenever available
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null;
    }
  }, [callState, localStream, remoteStream]);

  if (callState === 'idle') return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000
    }}>
      {/* Remote video (main view) */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a'
      }}>
        {callState === 'connected' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            {/* Avatar while connecting */}
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

            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '8px'
            }}>
              {otherUser?.displayName || otherUser?.username || 'User'}
            </h3>

            {callState === 'calling' && (
              <div>
                <p style={{ color: '#9ca3af', marginBottom: '32px' }}>
                  Calling...
                </p>
                <div style={{
                  width: '60px',
                  height: '60px',
                  margin: '0 auto',
                  border: '4px solid ' + (colors?.sendBtn || '#25d366'),
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
              </div>
            )}

            {callState === 'ringing' && (
              <div>
                <p style={{ color: '#9ca3af', marginBottom: '32px' }}>
                  Incoming video call...
                </p>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'center'
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
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        {callState !== 'idle' && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '200px',
            height: '150px',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            background: '#000'
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)' // Mirror effect
              }}
            />
            {isVideoOff && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}>
                Video Off
              </div>
            )}
          </div>
        )}

        {/* Call duration overlay */}
        {callState === 'connected' && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '8px 16px',
            borderRadius: '20px',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '1rem'
          }}>
            {formatDuration(callDuration)}
          </div>
        )}
      </div>

      {/* Control buttons */}
      <div style={{
        background: '#1a1a1a',
        padding: '24px',
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        alignItems: 'center'
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
                <path d="M4 6h16v12H4z M17 10.5V7c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
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
          <>
            {/* Mute button */}
            <button
              onClick={onToggleMute}
              style={{
                background: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                </svg>
              )}
            </button>

            {/* Video toggle button */}
            <button
              onClick={onToggleVideo}
              style={{
                background: isVideoOff ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
                  <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                </svg>
              )}
            </button>

            {/* End call button */}
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
          </>
        )}
      </div>
    </div>
  );
}
