import React from 'react';
import ProfileModal from '../../modals/ProfileModal';
import { getAvatarUrl } from '../../../services/avatarService';

export default function ChatHeader({
  otherUser,
  connectionStatus,
  typingUser,
  isReconnecting,
  theme,
  availableUsers,
  setShowOtherUserModal,
  setShowSearchModal,
  user,
  messages,
  colors,
  onStartVoiceCall,
  onStartVideoCall,
  voiceCallState,
  videoCallState,
  otherUserOnline,
  onLogout,
  onAvatarUpdate,
  onProfileUpdate,
  onOpenWallpaper,
  wallpaperActive,
  onOpenLightbox
}) {
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const moreMenuRef = React.useRef(null);

  const displayUser = otherUser || user;

  // ESC key handler for more menu
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showMoreMenu) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showMoreMenu]);

  // Close more menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  // Common button styles
  const iconButtonStyle = {
    width: 'clamp(36px, 10vw, 40px)',
    height: 'clamp(36px, 10vw, 40px)',
    minWidth: '36px',
    minHeight: '36px',
    borderRadius: '50%',
    background: 'rgba(99, 102, 241, 0.1)',
    border: 'none',
    color: colors.headerText,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  };

  return (
    <header style={{
      background: colors.header,
      color: colors.headerText,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(6px, 2vw, 12px)',
      /* backdropFilter: 'blur(20px)', -- REMOVED for performance */
      /* WebkitBackdropFilter: 'blur(20px)', */
      borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}`,
      position: 'relative',
      zIndex: 20
    }}>
      {/* Avatar + User Info Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={getAvatarUrl(displayUser?.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayUser?.displayName || displayUser?.username || 'User')}&size=40&background=6366f1&color=ffffff&bold=true`}
            alt=""
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayUser?.displayName || displayUser?.username || 'User')}&size=40&background=6366f1&color=ffffff&bold=true`;
            }}
            style={{
              border: `2px solid ${otherUserOnline ? '#10b981' : '#6b7280'}`,
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              objectFit: 'cover',
              backgroundColor: '#6366f1',
              cursor: 'pointer'
            }}
            onClick={() => {
              if (onOpenLightbox) {
                const avatar = getAvatarUrl(displayUser?.avatarUrl);
                const name = displayUser?.displayName || displayUser?.username || 'User';
                // If we have a custom avatar, use it. Otherwise generate a high-res default one
                const url = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=500&background=6366f1&color=ffffff&bold=true`;
                onOpenLightbox(url, 'image', 'avatar.jpg');
              }
            }}
          />
          {otherUserOnline && (
            <div style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              width: '12px',
              height: '12px',
              background: '#10b981',
              border: '2px solid ' + colors.header,
              borderRadius: '50%'
            }}></div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '16px',
            color: colors.headerText,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {displayUser?.displayName || displayUser?.username || 'User'}
          </div>
          <div style={{
            fontSize: '12px',
            color: theme === 'dark' ? '#9ca3af' : '#6b7280',
            marginTop: '2px'
          }}>
            {typingUser ? (
              <span style={{ color: '#10b981', fontWeight: 600 }}>typing...</span>
            ) : otherUserOnline ? (
              <span style={{ color: '#10b981' }}>● online</span>
            ) : (
              <span>offline</span>
            )}
            {isReconnecting && <span style={{ marginLeft: '8px', color: '#eab308' }}>• reconnecting...</span>}
          </div>
        </div>
      </div>

      {/* Action Buttons - Voice, Video, More Menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>

        {/* Voice Call Button */}
        {otherUser && voiceCallState === 'idle' && videoCallState === 'idle' && (
          <button
            onClick={onStartVoiceCall}
            disabled={connectionStatus !== 'connected'}
            style={{
              ...iconButtonStyle,
              opacity: connectionStatus === 'connected' ? 1 : 0.5,
              cursor: connectionStatus === 'connected' ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={e => { if (connectionStatus === 'connected') e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; }}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
            title={connectionStatus === 'connected' ? 'Voice call' : 'Connect to enable calls'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          </button>
        )}

        {/* Video Call Button */}
        {otherUser && voiceCallState === 'idle' && videoCallState === 'idle' && (
          <button
            onClick={onStartVideoCall}
            disabled={connectionStatus !== 'connected'}
            style={{
              ...iconButtonStyle,
              opacity: connectionStatus === 'connected' ? 1 : 0.5,
              cursor: connectionStatus === 'connected' ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={e => { if (connectionStatus === 'connected') e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; }}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
            title={connectionStatus === 'connected' ? 'Video call' : 'Connect to enable calls'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </button>
        )}

        {/* More Menu (⋮) */}
        <div style={{ position: 'relative' }} ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            style={iconButtonStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
            title="More options"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showMoreMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '48px',
              background: theme === 'dark' ? '#1f2937' : '#ffffff',
              border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
              borderRadius: '12px',
              minWidth: '200px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              zIndex: 1000,
              animation: 'slideDown 0.2s ease-out'
            }}>
              <style>
                {`
                  @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}
              </style>

              {/* Search Messages */}
              {otherUser && (
                <button
                  onClick={() => { setShowSearchModal(true); setShowMoreMenu(false); }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                    color: theme === 'dark' ? '#e5e7eb' : '#1f2937',
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Search Messages
                </button>
              )}

              {/* Contacts moved to top header (quick contact switcher) */}

              {/* Change Wallpaper */}
              {otherUser && (
                <button
                  onClick={() => { onOpenWallpaper(); setShowMoreMenu(false); }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                    color: theme === 'dark' ? '#e5e7eb' : '#1f2937',
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  Change Wallpaper
                  {wallpaperActive && <span style={{ marginLeft: 'auto', color: '#38bdf8', fontSize: '12px' }}>●</span>}
                </button>
              )}

              {/* View Profile moved to top header */}

              {/* Logout */}
              <button
                onClick={() => { onLogout(); setShowMoreMenu(false); }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      <ProfileModal
        show={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onAvatarUpdate={(newUrl) => {
          console.log('[chat] Avatar updated:', newUrl);
          if (onAvatarUpdate) {
            onAvatarUpdate(newUrl);
          }
          user.avatarUrl = newUrl;
          setShowProfileModal(false);
        }}
        onProfileUpdate={onProfileUpdate}
        theme={theme}
      />
    </header>
  );
}
