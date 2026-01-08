import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import AudioMessage from '../messages/AudioMessage';
import ImageMessage from '../messages/ImageMessage';
import DocumentMessage from '../messages/DocumentMessage';
import VideoMessage from '../messages/VideoMessage';
import CallMessage from '../messages/CallMessage';
import { fmtTime } from '../../../utils/format';
import { loadAuthenticatedMedia } from '../../../utils/mediaLoader';
import { toast } from 'react-hot-toast';

// MenuItem component for context menu
const MenuItem = ({ icon, label, onClick, theme, danger, colors }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        padding: '12px 16px',
        margin: '2px 4px',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: icon ? '12px' : '0',
        background: isHovered
          ? (danger
            ? 'rgba(255, 68, 68, 0.1)'
            : (colors?.primary ? `${colors.primary}15` : (theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')))
          : 'transparent',
        color: danger ? '#ff4444' : 'inherit',
        transition: 'all 0.2s ease',
        fontSize: '15px',
        fontWeight: '500' // Slightly bolder for better readability
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon && <span style={{ fontSize: '18px' }}>{icon}</span>}
      <span>{label}</span>
    </div>
  );
};

const MessageItem = React.memo(({
  msg,
  user,
  otherUser,
  colors,
  theme,
  onContextMenu,
  onLongPressStart,
  onLongPressEnd,
  onReply,
  onOpenLightbox,
  showOriginal,
  toggleShowOriginal
}) => {
  const isOwn = msg.senderId === user.id;

  // Special styling for call logs
  if (msg.type === 'call') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '8px 0'
      }}>
        <CallMessage message={msg} isOwn={isOwn} />
        <div style={{ fontSize: '0.7rem', color: colors.timestamp, marginTop: '2px' }}>
          {fmtTime(msg.timestamp || msg.createdAt)}
        </div>
      </div>
    );
  }

  const isDarkMode = theme === 'dark';
  const bubbleStyle = isOwn
    ? {
      background: colors.bubbleOut,
      color: colors.bubbleOutText,
      borderRadius: '20px 4px 20px 20px',
      padding: '10px 14px',
      maxWidth: '75%',
      boxShadow: isDarkMode ? '0 4px 6px rgba(0,0,0,0.1)' : '0 4px 12px rgba(0,0,0,0.08)',
      position: 'relative',
      backdropFilter: 'blur(25px)',
      WebkitBackdropFilter: 'blur(25px)',
      border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.5)'
    }
    : {
      background: colors.bubbleIn,
      color: colors.bubbleInText,
      borderRadius: '4px 20px 20px 20px',
      padding: '10px 14px',
      maxWidth: '75%',
      boxShadow: isDarkMode ? '0 4px 6px rgba(0,0,0,0.1)' : '0 4px 12px rgba(0,0,0,0.08)',
      position: 'relative',
      backdropFilter: 'blur(25px)',
      WebkitBackdropFilter: 'blur(25px)',
      border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.5)'
    };

  const renderReplyTo = (replyTo) => {
    if (!replyTo) return null;

    let replyMessage = replyTo;

    // If replyTo is just an ID string (should be resolved by parent, but handling here for safety)
    // Note: In optimized version, we expect full object or this might fail. 
    // Ideally parent resolves it. For now assume it's populated or we skip.
    if (typeof replyTo === 'string') return null;

    const getReplyContent = () => {
      switch (replyMessage.type) {
        case 'text': return replyMessage.content;
        case 'image': return '📷 Image';
        case 'video': return '🎥 Video';
        case 'audio': return '🎤 Voice message';
        case 'document': return `📄 ${replyMessage.metadata?.filename || 'Document'}`;
        case 'call': return '📞 Call';
        default: return replyMessage.content;
      }
    };

    return (
      <div style={{
        padding: '6px 10px',
        marginBottom: '6px',
        borderLeft: `3px solid ${colors.primary || '#3b82f6'}`,
        background: colors.replyBg || 'rgba(0,0,0,0.05)',
        borderRadius: '4px',
        fontSize: '0.8rem',
        cursor: 'pointer'
      }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{
          fontWeight: 600,
          color: colors.primary || '#3b82f6',
          marginBottom: '2px',
          fontSize: '0.75rem'
        }}>
          {replyMessage.senderId === user.id ? 'You' : (otherUser?.displayName || otherUser?.username || 'User')}
        </div>
        <div style={{
          color: colors.replyText || 'rgba(0,0,0,0.6)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {getReplyContent()}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        position: 'relative',
        marginBottom: '2px'
      }}
    >
      <div
        onContextMenu={(e) => onContextMenu(e, msg)}
        onTouchStart={(e) => onLongPressStart(e, msg)}
        onTouchEnd={onLongPressEnd}
        onTouchMove={onLongPressEnd}
        style={bubbleStyle}
      >
        {msg.replyTo && renderReplyTo(msg.replyTo)}
        {msg.type === 'text' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            // Responsive padding: 28px on mobile, 32px on desktop
            paddingLeft: isOwn ? (window.innerWidth < 768 ? '28px' : '32px') : '0',
            paddingRight: isOwn ? '0' : (window.innerWidth < 768 ? '28px' : '32px')
          }}>
            {msg.translatedText && !isOwn ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '2px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleShowOriginal(msg.id); }}
                    style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', fontSize: '10px', cursor: 'pointer', padding: 0, opacity: 0.8 }}
                  >
                    {showOriginal ? 'Show Translation' : 'Show Original'}
                  </button>
                </div>
                <span style={{ whiteSpace: 'pre-line' }}>
                  {showOriginal ? msg.content : msg.translatedText}
                </span>
              </>
            ) : (
              <span style={{ whiteSpace: 'pre-line' }}>{msg.content}</span>
            )}
          </div>
        )}
        {msg.type === 'image' && (
          <div style={{ paddingLeft: isOwn ? '32px' : '0', paddingRight: isOwn ? '0' : '32px' }}>
            <ImageMessage message={msg} mine={isOwn} onOpenLightbox={onOpenLightbox} />
          </div>
        )}
        {msg.type === 'video' && (
          <div style={{ paddingLeft: isOwn ? '32px' : '0', paddingRight: isOwn ? '0' : '32px' }}>
            <VideoMessage message={msg} mine={isOwn} onOpenLightbox={onOpenLightbox} theme={theme} colors={colors} />
          </div>
        )}
        {msg.type === 'audio' && (
          <div style={{ paddingLeft: isOwn ? '32px' : '0', paddingRight: isOwn ? '0' : '32px' }}>
            <AudioMessage message={msg} mine={isOwn} colors={colors} theme={theme} />
          </div>
        )}
        {msg.type === 'document' && (
          <div style={{ paddingLeft: isOwn ? '32px' : '0', paddingRight: isOwn ? '0' : '32px' }}>
            <DocumentMessage message={msg} mine={isOwn} onOpenLightbox={onOpenLightbox} />
          </div>
        )}

        {/* Three-dot menu button - responsive sizing */}
        <button
          style={{
            position: 'absolute',
            top: '6px',
            right: isOwn ? 'auto' : '6px',
            left: isOwn ? '6px' : 'auto',
            // Responsive sizing: 20px on mobile, 24px on desktop
            width: window.innerWidth < 768 ? '20px' : '24px',
            height: window.innerWidth < 768 ? '20px' : '24px',
            borderRadius: '50%',
            background: 'transparent', // Blends properly with bubble
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.8,
            transition: 'all 0.2s',
            zIndex: 2,
            padding: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.7';
            e.currentTarget.style.background = 'transparent';
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Create a synthetic event with the button's position
            const syntheticEvent = {
              ...e,
              currentTarget: e.currentTarget,
              preventDefault: () => { }
            };
            onContextMenu(syntheticEvent, msg);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              color: theme === 'dark' ? '#fff' : '#333',
              // Responsive sizing: smaller on mobile
              transform: window.innerWidth < 768 ? 'scale(0.75)' : 'scale(1)'
            }}
          >
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', color: colors.timestamp, marginTop: '2px', textAlign: isOwn ? 'right' : 'left' }}>
        {fmtTime(msg.timestamp || msg.createdAt)}
        {isOwn && msg.read && <span style={{ marginLeft: '8px', color: '#22c55e' }}>✓✓</span>}
        {msg.temporary && <span style={{ marginLeft: '8px', color: '#eab308' }}>sending...</span>}
      </div>
    </div>
  );
});

export default function ChatMessages({ messages, user, otherUser, onEdit, onDelete, onReply, onForward, colors, theme, onOpenLightbox }) {
  const [showOriginalMap, setShowOriginalMap] = useState({});
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, message: null });
  const [deleteConfirmation, setDeleteConfirmation] = useState({ visible: false, message: null });
  const menuRef = useRef(null);
  const longPressTimer = useRef(null);

  const toggleShowOriginal = useCallback((msgId) => {
    setShowOriginalMap(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  }, []);

  // Updated to handle resolving logic here if needed, or passing data down
  const resolveReplyTo = useCallback((replyTo, allMessages) => {
    if (!replyTo) return null;
    if (typeof replyTo === 'string') {
      return allMessages.find(m => m.id === replyTo || m._id === replyTo);
    }
    if (replyTo.id && !replyTo.content && !replyTo.type) {
      return allMessages.find(m => m.id === replyTo.id || m._id === replyTo.id);
    }
    return replyTo;
  }, []);

  const handleContextMenu = useCallback((e, msg) => {
    e.preventDefault();
    const elementRect = e.currentTarget.getBoundingClientRect();
    const isOwn = msg.senderId === user.id;

    // Get proper viewport dimensions (window.innerHeight can be wrong in some layouts)
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    // Calculate position - elementRect gives us viewport-relative coordinates
    // which is perfect for fixed positioning
    const menuWidth = 220;
    const menuHeight = 250; // approximate height

    // Position menu next to the element (button or bubble)
    // For own messages: try left first, then right
    // For received messages: try right first, then left
    let x, y;

    if (isOwn) {
      // Own message: try positioning to the left of the element
      x = elementRect.left - menuWidth - 10;
      // If off screen, try right side
      if (x < 10) {
        x = elementRect.right + 10;
      }
    } else {
      // Received message: try positioning to the right of the element
      x = elementRect.right + 10;
      // If off screen, try left side
      if (x + menuWidth > viewportWidth) {
        x = elementRect.left - menuWidth - 10;
      }
    }

    // Align menu top with the element
    y = elementRect.top;

    // Final boundary checks
    // Ensure menu stays within viewport bounds horizontally
    if (x < 10) {
      x = 10;
    }
    if (x + menuWidth > viewportWidth - 10) {
      x = viewportWidth - menuWidth - 10;
    }

    // Ensure menu doesn't go off bottom of screen
    if (y + menuHeight > viewportHeight) {
      y = Math.max(10, viewportHeight - menuHeight - 10);
    }

    if (y < 10) {
      y = 10;
    }

    setContextMenu({
      visible: true,
      x: x,
      y: y,
      message: msg,
      isMobile: false
    });
  }, [user.id]);

  const handleLongPressStart = useCallback((e, msg) => {
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({
        visible: true,
        x: touch.clientX,
        y: touch.clientY,
        message: msg,
        isMobile: true
      });
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, message: null });
  }, []);

  useEffect(() => {
    if (contextMenu.visible) {
      const handler = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          closeContextMenu();
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [contextMenu.visible, closeContextMenu]);

  return (
    <>
      {messages.map((msg, idx) => {
        // Resolve reply content once here to pass down cleanly
        const resolvedReply = msg.replyTo ? resolveReplyTo(msg.replyTo, messages) : null;

        return (
          <MessageItem
            key={msg.id || idx}
            msg={msg === resolvedReply ? { ...msg, replyTo: null } : { ...msg, replyTo: resolvedReply }} // Avoid circular or confusion
            user={user}
            otherUser={otherUser}
            colors={colors}
            theme={theme}
            onContextMenu={handleContextMenu}
            onLongPressStart={handleLongPressStart}
            onLongPressEnd={handleLongPressEnd}
            onReply={onReply}
            onOpenLightbox={onOpenLightbox}
            showOriginal={showOriginalMap[msg.id]}
            toggleShowOriginal={toggleShowOriginal}
          />
        );
      })}

      {/* Telegram-style Context Menu with backdrop overlay */}
      {contextMenu.visible && contextMenu.message && ReactDOM.createPortal(
        <>
          {/* Backdrop overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'transparent', // Transparent overlay instead of filter
              zIndex: 9998,
              // Removed animation to prevent layout thrashing
            }}
            onClick={closeContextMenu}
          />

          {/* Context Menu */}
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              bottom: contextMenu.isMobile ? 0 : 'auto',
              top: contextMenu.isMobile ? 'auto' : contextMenu.y,
              left: contextMenu.isMobile ? 0 : contextMenu.x,
              right: contextMenu.isMobile ? 0 : 'auto',
              borderRadius: contextMenu.isMobile ? '20px 20px 0 0' : '16px',
              minWidth: contextMenu.isMobile ? 'auto' : '220px',
              background: theme === 'dark' ? '#1e1e1e' : '#ffffff',
              // Removed blur for performance
              border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
              zIndex: 9999,
              color: theme === 'dark' ? '#fff' : '#000',
              fontSize: '15px',
              padding: contextMenu.isMobile ? '20px 0 30px 0' : '8px 0',
              animation: contextMenu.isMobile ? 'slideUp 0.3s ease-out' : 'fadeInScale 0.2s ease-out',
              transformOrigin: 'top left',
            }}
          >
            {/* Menu items */}
            <MenuItem
              icon=""
              label="Reply"
              onClick={() => { onReply(contextMenu.message); closeContextMenu(); }}
              theme={theme}
              colors={colors}
            />

            {contextMenu.message.senderId === user.id && contextMenu.message.type === 'text' && (
              <MenuItem
                icon=""
                label="Edit"
                onClick={() => { onEdit(contextMenu.message); closeContextMenu(); }}
                theme={theme}
                colors={colors}
              />
            )}

            <MenuItem
              icon=""
              label="Forward"
              onClick={() => { onForward(contextMenu.message); closeContextMenu(); }}
              theme={theme}
              colors={colors}
            />

            {/* Download option for media messages */}
            {(contextMenu.message.type === 'image' || contextMenu.message.type === 'video' || contextMenu.message.type === 'audio') && (
              <MenuItem
                icon=""
                label="Download"
                onClick={async () => {
                  try {
                    // Get the media ID from the content URL
                    const urlParts = contextMenu.message.content.split('/');
                    const mediaId = urlParts[urlParts.length - 1].split('?')[0];

                    // Load the authenticated media blob
                    const authenticatedBlobUrl = await loadAuthenticatedMedia(contextMenu.message.content, mediaId);

                    // Fetch the blob from the authenticated URL
                    const response = await fetch(authenticatedBlobUrl);
                    const blob = await response.blob();

                    // Determine filename and extension based on blob type or message metadata
                    let filename = contextMenu.message.metadata?.filename;
                    if (!filename) {
                      const timestamp = Date.now();
                      // Get extension from blob MIME type
                      let extension = '';
                      if (blob.type.includes('image/png')) extension = 'png';
                      else if (blob.type.includes('image/jpeg') || blob.type.includes('image/jpg')) extension = 'jpg';
                      else if (blob.type.includes('image/gif')) extension = 'gif';
                      else if (blob.type.includes('image/webp')) extension = 'webp';
                      else if (blob.type.includes('video/mp4')) extension = 'mp4';
                      else if (blob.type.includes('video/webm')) extension = 'webm';
                      else if (blob.type.includes('audio/mpeg')) extension = 'mp3';
                      else if (blob.type.includes('audio/webm')) extension = 'webm';
                      else if (blob.type.includes('audio/ogg')) extension = 'ogg';
                      else {
                        // Fallback based on message type
                        if (contextMenu.message.type === 'image') extension = 'jpg';
                        else if (contextMenu.message.type === 'video') extension = 'mp4';
                        else if (contextMenu.message.type === 'audio') extension = 'mp3';
                      }

                      filename = `${contextMenu.message.type}-${timestamp}.${extension}`;
                    }

                    // Create a temporary URL for the blob
                    const blobUrl = URL.createObjectURL(blob);

                    // Create and trigger download
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // Clean up the temporary URL
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

                    closeContextMenu();
                  } catch (error) {
                    console.error('Download failed:', error);
                    toast.error('Failed to download file. Please try again.');
                    closeContextMenu();
                  }
                }}
                theme={theme}
                colors={colors}
              />
            )}

            <div style={{
              height: '1px',
              background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              margin: '8px 0'
            }} />

            <MenuItem
              icon=""
              label={contextMenu.message.senderId === user.id ? 'Delete for everyone' : 'Delete for me'}
              onClick={() => {
                setDeleteConfirmation({ visible: true, message: contextMenu.message });
                closeContextMenu();
              }}
              theme={theme}
              colors={colors}
              danger
            />
          </div>

          {/* CSS Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            @keyframes slideUp {
              from { 
                transform: translateY(100%);
                opacity: 0;
              }
              to { 
                transform: translateY(0);
                opacity: 1;
              }
            }
            
            @keyframes fadeInScale {
              from { 
                opacity: 0;
                transform: scale(0.9);
              }
              to { 
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
        </>,
        document.body
      )}

      {/* Modern Delete Confirmation Dialog */}
      {deleteConfirmation.visible && deleteConfirmation.message && ReactDOM.createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={() => setDeleteConfirmation({ visible: false, message: null })}
          >
            {/* Dialog */}
            <div
              style={{
                background: theme === 'dark' ? 'rgba(30, 30, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '20px',
                padding: '32px',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                animation: 'fadeInScale 0.3s ease-out',
              }}
              onClick={(e) => e.stopPropagation()}
            >


              {/* Title */}
              <h3 style={{
                margin: '0 0 12px 0',
                fontSize: '20px',
                fontWeight: '600',
                textAlign: 'center',
                color: theme === 'dark' ? '#fff' : '#000',
              }}>
                Delete Message?
              </h3>

              {/* Description */}
              <p style={{
                margin: '0 0 28px 0',
                fontSize: '15px',
                textAlign: 'center',
                color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                lineHeight: '1.5',
              }}>
                {deleteConfirmation.message.senderId === user.id
                  ? 'This message will be deleted for everyone in the chat.'
                  : 'This message will be deleted for you only.'}
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* Cancel */}
                <button
                  onClick={() => setDeleteConfirmation({ visible: false, message: null })}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    borderRadius: '12px',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`,
                    background: 'transparent',
                    color: theme === 'dark' ? '#fff' : '#000',
                    fontSize: '15px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Cancel
                </button>

                {/* Delete */}
                <button
                  onClick={() => {
                    onDelete(deleteConfirmation.message);
                    setDeleteConfirmation({ visible: false, message: null });
                  }}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#ff4444',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ff2222';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ff4444';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}


    </>
  );
}
