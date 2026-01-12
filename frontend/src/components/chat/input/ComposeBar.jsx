import React, { useState, useEffect } from 'react';
import ReplyPreview from './ReplyPreview';
import BotActivation from './BotActivation';
import MediaPreviewModal from '../../modals/MediaPreviewModal';

export default function ComposeBar({
  text,
  setText,
  onTyping,
  otherUser,
  uploading,
  selectFile, // Changed from uploadImage
  uploadFile, // Added
  recording,
  startRecording,
  stopRecording,
  sending,
  editingMessage,
  cancelEdit,
  replyingTo,
  cancelReply,
  send,
  connectionStatus,
  colors,
  currentUserId,
  theme // Added
}) {
  const [isBotActive, setIsBotActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState(null); // Added for preview modal
  const inputRef = React.useRef(null);

  // Auto-focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);


  // Check if bot mode is active  -- REMOVED

  const handleBotDeactivate = () => {
    setIsBotActive(false);
  };

  const toggleAi = () => {
    setIsBotActive(prev => !prev);
    inputRef.current?.focus();
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (sending || uploading || !text.trim()) return;

    // Inject AI prefix if bot mode is active
    let contentOverride = null;
    if (isBotActive) {
      // Ensure we don't double prefix if user manually typed it (edge case)
      if (!text.startsWith('@#')) {
        contentOverride = '@# ' + text;
      }
    }

    send(e, contentOverride);
  };

  return (
    <>
      <form
        onSubmit={handleSend}
        style={{
          background: isDragging ? (theme === 'dark' ? 'rgba(31, 44, 51, 0.8)' : 'rgba(224, 231, 255, 0.6)') : colors.inputBg,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: '24px',
          margin: '0 16px 16px 16px',
          border: `1px solid ${colors.inputBorder}`,
          boxShadow: theme === 'dark' ? '0 4px 16px 0 rgba(31, 38, 135, 0.1)' : '0 4px 16px 0 rgba(31, 38, 135, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transition: 'background 0.2s ease',
          width: 'calc(100% - 32px)',
          alignSelf: 'center',
          maxWidth: '900px'
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const files = e.dataTransfer.files;
          if (files && files.length > 0) {
            setStagedFile(files[0]);
          }
        }}
        onPaste={(e) => {
          const items = e.clipboardData.items;
          for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
              const file = items[i].getAsFile();
              if (file) {
                setStagedFile(file);
                e.preventDefault();
                break;
              }
            }
          }
        }}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(99, 102, 241, 0.1)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            color: '#4f46e5',
            fontWeight: 'bold',
            pointerEvents: 'none' // Allow drop on the form
          }}>
            Drop to upload
          </div>
        )}

        {/* Bot Activation Indicator */}
        <BotActivation isActive={isBotActive} onDeactivate={handleBotDeactivate} />

        {/* Reply Preview */}
        {replyingTo && (
          <ReplyPreview
            replyToMessage={{
              ...replyingTo,
              currentUserId,
              senderName: replyingTo.senderId === currentUserId ? 'You' : (otherUser?.displayName || otherUser?.username || 'User')
            }}
            onCancel={cancelReply}
            colors={colors}
          />
        )}

        {/* Edit Preview */}
        {editingMessage && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: '8px', background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, borderRadius: '8px 8px 0 0' }}>
            <span>Editing message</span>
            <button type="button" style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }} onClick={cancelEdit}>Cancel</button>
          </div>
        )}

        {/* Input Bar */}
        <div style={{ padding: '10px 8px', display: 'flex', alignItems: 'center', gap: 'clamp(4px, 1.5vw, 8px)' }}>
          <button
            type="button"
            style={{ padding: 'clamp(6px, 2vw, 8px)', borderRadius: '50%', background: 'none', border: 'none', color: colors.inputText, cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.background = colors.inputBorder}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => selectFile((file) => setStagedFile(file))}
            disabled={uploading || sending || !otherUser}
            title="Attach image, video or PDF"
          >
            {uploading ? (
              <div style={{ width: '24px', height: '24px', border: '2px solid #9ca3af', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            )}
          </button>

          <button
            className="ai-toggle-btn p-2 rounded-full transition-all duration-300"
            style={{
              background: isBotActive ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : 'transparent',
              color: isBotActive ? 'white' : colors.inputText,
              boxShadow: isBotActive ? '0 2px 10px rgba(99, 102, 241, 0.3)' : 'none',
              transform: isBotActive ? 'scale(1.1)' : 'scale(1)'
            }}
            onMouseEnter={e => {
              if (!isBotActive) e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
            }}
            onMouseLeave={e => {
              if (!isBotActive) e.currentTarget.style.background = 'transparent';
            }}
            onClick={toggleAi}
            title={isBotActive ? "Deactivate AI" : "Activate AI Companion"}
          >
            {/* AI Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" fill={isBotActive ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM10.5 7.5L12 6m-2.25 4.5L12 12m-2.25 4.5L12 18" />
            </svg>
          </button>

          <input
            ref={inputRef}
            className="placeholder-gray-500 dark:placeholder-gray-400"
            style={{
              flex: 1,
              minWidth: 0,
              border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
              background: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(243, 244, 246, 0.8)', // Darker/Gray background for input
              color: colors.inputText,
              padding: 'clamp(8px, 2vw, 10px) clamp(12px, 2.5vw, 16px)',
              borderRadius: '20px',
              fontSize: 'clamp(0.875rem, 4vw, 1rem)',
              outline: 'none',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            type="text"
            placeholder={otherUser ? `Message ${otherUser.displayName || otherUser.username}` : 'Type a message...'}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
            onInput={onTyping}
            disabled={sending || uploading || !otherUser}
            autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
          />

          <button
            type="button"
            style={{ padding: 'clamp(6px, 2vw, 8px)', borderRadius: '50%', background: recording ? '#ef4444' : 'none', border: 'none', color: recording ? '#fff' : colors.inputText, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
            onMouseEnter={e => { if (!recording) e.currentTarget.style.background = colors.inputBorder; }}
            onMouseLeave={e => { if (!recording) e.currentTarget.style.background = 'none'; }}
            onClick={recording ? stopRecording : startRecording}
            disabled={sending || uploading || !otherUser}
            title={recording ? 'Stop recording' : 'Record voice message'}
          >
            {recording ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}>
                <circle cx="12" cy="12" r="8" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          <button
            type="submit"
            style={{ background: colors.sendBtn || colors.primary, color: '#fff', border: 'none', borderRadius: '50%', width: 'clamp(36px, 11vw, 44px)', height: 'clamp(36px, 11vw, 44px)', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
            onMouseEnter={e => {
              e.currentTarget.style.filter = 'brightness(1.3)'; // Brighter hover
              e.currentTarget.style.transform = 'scale(1.1)'; // More pop
            }}
            onMouseLeave={e => {
              e.currentTarget.style.filter = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            disabled={sending || uploading || !text.trim() || !otherUser}
            title={connectionStatus !== 'connected' ? 'Offline - will send when reconnected' : 'Send'}
          >
            {sending ? (
              <div style={{ width: '24px', height: '24px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>

        {connectionStatus !== 'connected' && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: '4px', padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0 0 8px 8px', fontSize: '0.75rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: '#fbbf24', borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
            <span>{connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Offline - messages will be sent when connection is restored'}</span>
          </div>
        )}
      </form>

      <MediaPreviewModal
        file={stagedFile}
        isOpen={!!stagedFile}
        onClose={() => setStagedFile(null)}
        onSend={(file, caption) => {
          uploadFile(file, caption);
          setStagedFile(null);
        }}
        theme={theme}
      />
    </>
  );
}
