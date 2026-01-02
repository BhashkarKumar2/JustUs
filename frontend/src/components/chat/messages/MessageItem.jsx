import React, { useState, useEffect, useRef } from 'react';
import { loadAuthenticatedMedia } from '../../../utils/mediaLoader';
import BotMessage from './BotMessage';

export default function MessageItem({ me, m, onEdit, onDelete, onContextMenu }) {
  // Check if this is a bot message
  if (m.isBot || m.senderId === 'bot') {
    return <BotMessage message={m} />;
  }

  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [mediaUrl, setMediaUrl] = useState(m.content);
  const [blobUrl, setBlobUrl] = useState(null);
  const mine = me === m.senderId;
  const isTemporary = m.temporary === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Load authenticated media for image and audio messages
  useEffect(() => {
    const loadMedia = async () => {
      if ((m.type === 'image' || m.type === 'audio') && m.content && !isTemporary) {
        try {
          setImageLoading(true);
          setImageError(false);
          setBlobUrl(null); // Clear any previous blob URL

          // Extract media ID from URL for caching
          const urlParts = m.content.split('/');
          const mediaId = urlParts[urlParts.length - 1].split('?')[0];

          console.log('MessageItem: Loading authenticated media for ID:', mediaId, 'URL:', m.content);
          console.log('MessageItem: Is temporary?', isTemporary);

          // Add a small delay to ensure authentication is properly set
          await new Promise(resolve => setTimeout(resolve, 100));

          // Load media with authentication
          const authenticatedBlobUrl = await loadAuthenticatedMedia(m.content, mediaId);
          setBlobUrl(authenticatedBlobUrl);
          setImageLoading(false);

          console.log('MessageItem: Successfully loaded authenticated media:', authenticatedBlobUrl);
        } catch (error) {
          console.error('MessageItem: Failed to load authenticated media:', error);

          // If first attempt fails, try once more after a short delay
          if (retryCount === 0) {
            console.log('MessageItem: First attempt failed, trying automatic retry...');
            setTimeout(() => {
              setRetryCount(1);
            }, 1000);
          } else {
            setImageError(true);
            setImageLoading(false);
            console.log('Media authentication failed - check if user is logged in');
          }
        }
      } else if ((m.type === 'image' || m.type === 'audio') && m.content && isTemporary) {
        // For temporary messages, use the URL directly and set it as both mediaUrl and blobUrl
        setMediaUrl(m.content);
        setBlobUrl(m.content);  // Set blobUrl so the image/audio displays
        setImageLoading(false);
      }
    };

    loadMedia();
  }, [m.content, m.type, isTemporary, retryCount]);

  // Close menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current || !triggerRef.current) return;
      if (menuRef.current.contains(e.target) || triggerRef.current.contains(e.target)) return;
      setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatEditTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Debug log for rendering
  console.log(`[Frontend] Rendering MessageItem ${m.id}:`, {
    content: m.content,
    translatedText: m.translatedText,
    mine,
    me,
    senderId: m.senderId,
    showOriginal
  });

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85vw] sm:max-w-md lg:max-w-lg relative group ${mine ? 'ml-6 sm:ml-12' : 'mr-6 sm:mr-12'}`}>

        {/* Message Container */}
        <div className={`signal-bubble ${mine ? 'signal-bubble-sent' : 'signal-bubble-received'} ${isTemporary ? 'opacity-70' : ''}`}>

          {/* Message Bubble Tail */}
          <div className={`absolute w-4 h-4 transform rotate-45 ${mine
            ? 'bg-gradient-to-r from-white to-white -right-2 bottom-4'
            : 'bg-white/80 -left-2 bottom-4 border-l border-b border-gray-200/50'
            }`}></div>

          {/* Message Header */}
          <div className={`flex items-center justify-between mb-3 signal-text-xs ${mine ? 'text-white/80' : 'text-gray-500'}`}>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full connection-pulse ${mine ? 'bg-indigo-200' : 'bg-indigo-500'}`}></div>
              <span className="font-semibold text-white">
                {mine ? 'You' : (m.senderDisplayName || m.senderUsername || 'Unknown')}
                {isTemporary && <span className="ml-2 italic opacity-75 float-animation">(sending...)</span>}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="signal-timestamp">
                <span>{formatTime(m.timestamp || m.createdAt)}</span>
              </div>

              {/* Inline read/delivered status next to time */}
              {mine && !isTemporary && m.delivered && !m.read && (
                <div className="flex items-center space-x-1 text-gray-400 text-[11px]">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Delivered</span>
                </div>
              )}
              {mine && !isTemporary && m.read && (
                <div className="flex items-center space-x-1 text-blue-400 text-[11px]">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <svg className="w-3 h-3 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Read</span>
                </div>
              )}

              {/* Dropdown trigger - Available for both sender and receiver */}
              {!m.deleted && (
                <div className="relative">
                  <button
                    ref={triggerRef}
                    onClick={(e) => {
                      // Prefer prop handler (from ChatPage -> ChatMessages) to position menu relative to bubble
                      if (typeof onContextMenu === 'function') {
                        onContextMenu(e.currentTarget, m);
                      }
                      setMenuOpen(s => !s);
                    }}
                    className="signal-icon-button"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6 10a2 2 0 114 0 2 2 0 01-4 0zm4 0a2 2 0 114 0 2 2 0 01-4 0zM2 10a2 2 0 114 0 2 2 0 01-4 0z" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div ref={menuRef} className="absolute right-0 top-8 bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 py-1 w-40 z-50 signal-slide-up">
                      {mine && (
                        <>
                          <button onClick={() => { setMenuOpen(false); onEdit(m); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-100 flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                            Edit
                          </button>
                        </>
                      )}
                      <button onClick={() => { setMenuOpen(false); onDelete(m); }} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-2 0H4a1 1 0 000 2v12a2 2 0 002 2h8a2 2 0 002-2V4a1 1 0 100-2h-3zM8 11a1 1 0 112 0v3a1 1 0 11-2 0v-3zm4-1a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Delete {mine ? 'for everyone' : 'for me'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Edit Indicator */}
          {m.edited && (
            <div className={`text-xs mb-3 flex items-center space-x-1 ${mine ? 'text-indigo-200' : 'text-gray-500'}`}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              <span className="font-medium">Edited</span>
              {m.editedAt && <span className="opacity-75">• {formatEditTime(m.editedAt)}</span>}
            </div>
          )}

          {/* Message Content */}
          <div className="mb-3">
            {m.deleted ? (
              <div className={`italic flex items-center space-x-2 ${mine ? 'text-indigo-200' : 'text-gray-500'}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>This message was deleted</span>
              </div>
            ) : (
              <>
                {m.type === 'text' && (
                  <div className="whitespace-pre-wrap break-words leading-relaxed font-medium min-w-[60px]">
                    {/* Main Content (Original or Translated based on state) */}
                    <div>
                      {showOriginal ? m.content : m.translatedText}
                    </div>

                    {/* Translation Toggle */}
                    {m.translatedText && (
                      <div className="mt-1 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowOriginal(!showOriginal);
                          }}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity bg-black/10 hover:bg-black/20 px-2 py-1 rounded-md"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                          {showOriginal ? 'Translate' : 'Original'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {m.type === 'image' && (
                  <div className="relative overflow-hidden rounded-2xl">
                    {imageLoading && !imageError && (
                      <div className="w-64 h-40 image-skeleton rounded-2xl flex items-center justify-center">
                        <div className="modern-spinner"></div>
                      </div>
                    )}
                    {(imageError || !blobUrl) ? (
                      <div className="w-64 h-40 bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center border border-gray-200">
                        <div className="text-center text-gray-500 p-4">
                          <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <p className="text-xs mb-3 font-medium">
                            {imageError ? 'Failed to load image' : 'Loading image...'}
                          </p>
                          <p className="text-xs mb-3 text-gray-400">
                            Debug: blobUrl={blobUrl ? 'present' : 'null'}, error={imageError.toString()}
                          </p>
                          <div className="space-y-2">
                            <button
                              className="px-4 py-2 bg-indigo-500 text-white text-xs rounded-xl hover:bg-indigo-600 transition-all duration-300 shadow-lg modern-button"
                              onClick={() => {
                                const token = localStorage.getItem('token');
                                if (token) {
                                  const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
                                  const url = new URL(m.content, baseUrl);
                                  url.searchParams.set('token', token);
                                  window.open(url.toString(), '_blank');
                                }
                              }}
                            >
                              Open Image
                            </button>
                            {retryCount < 3 && (
                              <button
                                className="block w-full px-3 py-2 bg-gray-500 text-white text-xs rounded-xl hover:bg-gray-600 transition-all duration-300 modern-button"
                                onClick={() => {
                                  setImageError(false);
                                  setImageLoading(true);
                                  setBlobUrl(null);
                                  setRetryCount(prev => prev + 1);
                                }}
                              >
                                Retry Loading ({retryCount}/3)
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={blobUrl}
                        alt="Shared image"
                        className={`max-w-[min(320px,75vw)] rounded-2xl cursor-pointer transition-all duration-300 hover:scale-105 shadow-lg ${imageLoading ? 'opacity-0 absolute' : 'opacity-100'
                          }`}
                        onLoad={(e) => {
                          console.log('MessageItem: Image loaded successfully from blob URL');
                          setImageLoading(false);
                          setImageError(false);
                        }}
                        onError={(e) => {
                          console.error('MessageItem: Image failed to load from blob URL:', blobUrl);
                          setImageLoading(false);
                          setImageError(true);
                        }}
                        onClick={() => window.open(blobUrl, '_blank')}
                      />
                    )}
                  </div>
                )}

                {m.type === 'audio' && (
                  <div className="w-full">
                    {imageError || !blobUrl ? (
                      <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl p-4 border border-gray-200">
                        <div className="text-center text-gray-500">
                          <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                          </svg>
                          <p className="text-xs mb-3 font-medium">Audio requires authentication</p>
                          <button
                            className="px-4 py-2 bg-indigo-500 text-white text-xs rounded-xl hover:bg-indigo-600 transition-colors shadow-lg"
                            onClick={() => {
                              const token = localStorage.getItem('token');
                              if (token) {
                                const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
                                const url = new URL(m.content, baseUrl);
                                url.searchParams.set('token', token);
                                window.open(url.toString(), '_blank');
                              }
                            }}
                          >
                            Open Audio
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-3 rounded-2xl ${mine ? 'bg-white/20' : 'bg-gray-100/80'}`}>
                        <audio
                          controls
                          src={blobUrl}
                          className="w-full max-w-[min(320px,75vw)]"
                          style={{ filter: mine ? 'invert(1) brightness(0.8)' : 'none' }}
                          onError={() => {
                            setImageError(true);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {m.type && !['text', 'image', 'audio'].includes(m.type) && (
                  <div className={`text-sm flex items-center space-x-2 ${mine ? 'text-indigo-200' : 'text-gray-600'}`}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">{m.type} attachment</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* old action/status block moved inline above */}
        </div>

        {/* Message Timestamp on Hover */}
        <div className={`timestamp-hover absolute ${mine ? 'left-0' : 'right-0'} top-0 pointer-events-none z-10`}>
          <div className={`px-3 py-2 bg-black/80 text-white text-xs rounded-xl backdrop-blur-sm border border-white/10 ${mine ? '-translate-x-full -ml-3' : 'translate-x-full ml-3'}`}>
            <div className="font-medium">{new Date(m.timestamp || m.createdAt).toLocaleString()}</div>
            {m.edited && <div className="text-white/70 text-[10px] mt-1">Edited</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
