import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { getConnectionStatus, getSocket } from '../../services/socket';
import ChatHeader from '../../components/chat/layout/ChatHeader';
import ChatMessages from '../../components/chat/layout/ChatMessages';
import Lightbox from '../../components/chat/layout/Lightbox';
import TypingIndicator from '../../components/chat/layout/TypingIndicator';
import ScrollToBottomButton from '../../components/chat/layout/ScrollToBottomButton';
import ComposeBar from '../../components/chat/input/ComposeBar';
import UserSelectModal from '../../components/modals/UserSelectModal';
import VoiceCallModal from '../../components/modals/VoiceCallModal';
import VideoCallModal from '../../components/modals/VideoCallModal';
import SmartSearch from '../../components/modals/SmartSearch';
import WallpaperPanel from '../../components/chat/layout/WallpaperPanel';
import useChatSocket from '../../hooks/useChatSocket';
import useVoiceMessage from '../../hooks/useVoiceMessage';
import useReadReceipts from '../../hooks/useReadReceipts';
import useImageUpload from '../../hooks/useImageUpload';
import useVoiceCall from '../../hooks/useVoiceCall';
import useVideoCall from '../../hooks/useVideoCall';
import useEncryption from '../../hooks/useEncryption';
import { useReconnection } from '../../hooks/useReconnection';
import NotificationManager from '../../components/common/NotificationManager';
import useWallpaper from '../../hooks/useWallpaper';
import useChatInitialization from '../../hooks/useChatInitialization';
import useMessageSender from '../../hooks/useMessageSender';
import { forwardMessage } from '../../services/chat';
import { saveWallpaper } from '../../services/wallpaperService';
import { mergeMessages } from '../../utils/chatUtils';
import api from '../../services/api';
import OnboardingTour from '../../components/OnboardingTour';
// Group Chat Imports
import GroupListPanel from '../../components/groups/GroupListPanel';
import GroupChatPage from '../../pages/groups/GroupChatPage';
import CreateGroupModal from '../../components/modals/CreateGroupModal';
import * as groupService from '../../services/groupService';

export default function ChatPage({ user, onLogout, onUserUpdate, showContactSwitcher, setShowContactSwitcher, theme = 'light' }) {
  const encryption = useEncryption();
  const [showTour, setShowTour] = useState(false);

  // Custom Hooks
  const {
    messages,
    setMessages,
    conversationId,
    otherUser,
    otherUserId,
    setOtherUserId,
    availableUsers,
    loading,
    hasMoreMessages,
    loadingMore,
    loadMoreMessages
  } = useChatInitialization(user, encryption);

  const {
    wallpaperSettings,
    setWallpaperSettings, // Exposed for save update
    wallpaperPreview,
    setWallpaperPreview,
    wallpaperPanelOpen,
    openWallpaperPanel,
    closeWallpaperPanel,
    resolvedWallpaperUrl,
    presets: wallpaperPresets
  } = useWallpaper(conversationId);

  const {
    text,
    setText,
    sending,
    editingMessage,
    setEditingMessage,
    replyingTo,
    setReplyingTo,
    sendMessage
  } = useMessageSender({
    user,
    otherUserId,
    conversationId,
    setMessages,
    encryption
  });

  const {
    recording,
    startRecording,
    stopRecording,
    transcript,
    transcribing
  } = useVoiceMessage({
    userId: user?.id,
    otherUserId,
    conversationId,
    setMessages
  });

  // Local UI State
  const [showOtherUserModal, setShowOtherUserModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [lightbox, setLightbox] = useState({ visible: false, url: null, type: null, filename: null });
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [savingWallpaper, setSavingWallpaper] = useState(false);
  // Group Chat State
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'groups'
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  // Refs
  const chatContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const connectedRef = useRef(false);

  // E2EE Key Exchange
  useEffect(() => {
    const keyExchangeTimeout = setTimeout(() => {
      if (encryption.getKeyPair()) {
        encryption.exchangeKey();
      }
    }, 500);
    return () => clearTimeout(keyExchangeTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Onboarding Tour Trigger (flag stored in database)
  useEffect(() => {
    if (!user.hasCompletedTour) {
      setTimeout(() => setShowTour(true), 1500); // Small delay for UX
    }
  }, [user.hasCompletedTour]);

  const handleTourClose = () => {
    setShowTour(false);
    // Persist to database
    api.post('/api/auth/complete-tour').catch(err =>
      console.error('Failed to save tour status:', err)
    );
    // Update local user state immediately
    if (onUserUpdate) onUserUpdate({ hasCompletedTour: true });
  };

  // Theme effect - Managed globally by App.jsx, but we ensure body class is correct just in case
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]);

  // Contact Switcher Effect
  useEffect(() => {
    if (showContactSwitcher) {
      setShowOtherUserModal(true);
      try { setShowContactSwitcher(false); } catch { /* Parent state update - intentionally ignored */ }
    }
  }, [showContactSwitcher, setShowContactSwitcher]);

  // Listen for top-header 'Add contact' event
  useEffect(() => {
    const openAddContact = () => setShowOtherUserModal(true);
    window.addEventListener('open-add-contact', openAddContact);
    return () => window.removeEventListener('open-add-contact', openAddContact);
  }, []);

  // Handlers
  const handleUserSelect = (userId) => {
    setOtherUserId(userId);
    localStorage.setItem('otherUserId', userId);
    setShowOtherUserModal(false);
  };

  const handleForwardToUser = (targetUserId) => {
    if (!forwardingMessage) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat.send', {
      receiverId: targetUserId,
      type: forwardingMessage.type,
      content: forwardingMessage.content,
      forwarded: true,
      metadata: forwardingMessage.metadata,
      replyTo: null
    });

    setShowForwardModal(false);
    setForwardingMessage(null);
  };

  const handleOpenLightbox = (url, type, filename) => {
    setLightbox({ visible: true, url, type, filename });
  };

  const handleAvatarUpdate = (newUrl) => {
    if (onUserUpdate) onUserUpdate({ avatarUrl: newUrl });
  };

  // Group Handlers
  const handleCreateGroup = async (groupData) => {
    try {
      const response = await groupService.createGroup(
        groupData.name,
        groupData.description,
        groupData.memberIds
      );
      toast.success(`Group "${response.group.name}" created!`);
      setSelectedGroup(response.group);
      setActiveTab('groups');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create group');
      throw err;
    }
  };

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
  };

  const handleBackFromGroup = () => {
    setSelectedGroup(null);
  };

  // Image Upload Hook
  const { uploading, selectFile, uploadFile } = useImageUpload({
    userId: user.id,
    otherUserId: otherUserId || localStorage.getItem('otherUserId'),
    conversationId,
    setMessages
  });

  // Voice Call
  const {
    callState: voiceCallState,
    incomingCall: incomingVoiceCall,
    callDuration: voiceCallDuration,
    isMuted: voiceIsMuted,
    startCall: startVoiceCall,
    answerCall: answerVoiceCall,
    rejectCall: rejectVoiceCall,
    endCall: endVoiceCall,
    toggleMute: toggleVoiceMute,
    localStreamRef: voiceLocalStreamRef,
    remoteStreamRef: voiceRemoteStreamRef
  } = useVoiceCall({
    socket: getSocket(),
    userId: user.id,
    otherUserId: otherUserId,
    otherUser: otherUser,
    onCallEnd: (duration) => console.log(`Voice call ended: ${duration}s`)
  });

  // Video Call
  const {
    callState: videoCallState,
    incomingCall: incomingVideoCall,
    callDuration: videoCallDuration,
    isMuted,
    isVideoOff,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    rejectCall: rejectVideoCall,
    endCall: endVideoCall,
    toggleMute,
    toggleVideo,
    localStream: videoLocalStream,
    remoteStream: videoRemoteStream,
    localStreamRef: videoLocalStreamRef,
    remoteStreamRef: videoRemoteStreamRef
  } = useVideoCall({
    socket: getSocket(),
    userId: user.id,
    otherUserId: otherUserId,
    otherUser: otherUser,
    onCallEnd: (duration) => console.log(`Video call ended: ${duration}s`)
  });

  // Socket Hook
  const { onTyping: onTypingHook } = useChatSocket({
    token: localStorage.getItem('token'),
    userId: user.id,
    availableUsers,
    setMessages,
    setTypingUser,
    setConnectionStatus,
    setReconnectAttempts,
    isReconnecting,
    setIsReconnecting,
    connectedRef,
    typingTimeoutRef,
    encryption, // Pass encryption for socket message decryption
    onUserStatusChange: (userId, online) => {
      if (userId === otherUserId) setOtherUserOnline(online);
    }
  });

  // Reconnection Hook
  const {
    connectionStatus: realConnectionStatus,
    showRateLimitWarning,
    rateLimitRetryAfter
  } = useReconnection({
    userId: user.id,
    otherUserId,
    conversationId,
    messages,
    setMessages
  });

  // Read Receipts
  useReadReceipts(conversationId, messages);

  // Scroll Handling
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    if (chatContainerRef.current.scrollTop < 50 && hasMoreMessages && !loadingMore) {
      loadMoreMessages();
    }
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserScrolledUp(!isNearBottom);
  };

  // Smart Scroll Effect
  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    const currentLength = messages.length;
    const wasAtBottom = !userScrolledUp;
    if (currentLength > prevMessagesLengthRef.current && (wasAtBottom || prevMessagesLengthRef.current === 0)) {
      scrollToBottom();
    }
    prevMessagesLengthRef.current = currentLength;
  }, [messages, userScrolledUp]);

  // Derived Values
  const darkMode = theme === 'dark';
  const colors = {
    // START CHANGE: Use transparent bg to let App.js gradient show through
    bg: 'transparent',
    // END CHANGE
    chatBg: darkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)', // Slightly more transparent
    text: darkMode ? '#e5e7eb' : '#1f2937',
    inputText: darkMode ? '#f3f4f6' : '#1f2937',
    inputBg: darkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.7)', // Reduced opacity for light mode
    inputBorder: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)',

    // Header Colors
    // User requested matching colors. Using a consistent dark glass style.
    // OPTIMIZATION: Increased opacity to 0.95 to avoid needing backdrop-blur
    header: darkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    headerText: darkMode ? '#e5e7eb' : '#1f2937',

    // Bubble Colors (Unified as per request: "bubble out should be same color as bubble in")
    bubbleOut: darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.65)', // Reduced opacity
    bubbleIn: darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.65)', // Reduced opacity

    // Text Colors for Bubbles
    bubbleOutText: darkMode ? '#e5e7eb' : '#111111',
    bubbleInText: darkMode ? '#e5e7eb' : '#111111',

    timestamp: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',

    // Reply Colors
    primary: darkMode ? '#9ca3af' : '#3b82f6', // Gray-400 for dark mode
    replyBg: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)',
    replyText: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)',

    messageReceivedBg: darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.65)',
    messageSentBg: darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.65)',

    // Action Colors
    sendBtn: darkMode ? '#6b7280' : '#3b82f6', // Gray-500 for dark mode
  };
  const wallpaperIsGradient = wallpaperPreview.sourceType === 'preset';
  const wallpaperActive = wallpaperSettings.sourceType !== 'none' && Boolean(resolvedWallpaperUrl);

  const onDelete = (id) => {
    // Basic delete handler - in a full refactor this could be in a hook too
    const socket = getSocket();
    if (socket) {
      socket.emit('chat.delete', { messageId: id, conversationId, userId: user.id });
    }
    setMessages(prev => prev.filter(m => m.id !== id && m._id !== id));
  };


  return (
    <div style={{ background: 'transparent', minHeight: '100vh', padding: window.innerWidth < 768 ? '0' : '10px' }}>
      <div style={{
        maxWidth: '64rem',
        margin: '0 auto',
        height: window.innerWidth < 768 ? 'calc(100vh - 64px)' : 'calc(100vh - 20px)',
        display: 'flex',
        flexDirection: 'column',
        // REMOVED GLASS BACKGROUND TO FIX "SQUARE" LOOK
        background: 'transparent',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        borderRadius: window.innerWidth < 768 ? '0' : '32px', // Keep rounded on desktop, square on mobile
        border: `3px solid ${colors.primary}50`,
        overflow: 'hidden',
        position: 'relative'
      }}>

        {/* Tab Navigation - Chats / Groups */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
          background: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)',
          zIndex: 10
        }}>
          <button
            onClick={() => setActiveTab('chats')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: activeTab === 'chats'
                ? (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(102, 126, 234, 0.2)')
                : 'transparent',
              color: activeTab === 'chats' ? (darkMode ? '#e5e7eb' : '#667eea') : (darkMode ? '#9ca3af' : '#6b7280'),
              fontWeight: activeTab === 'chats' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderBottom: activeTab === 'chats' ? (darkMode ? '2px solid #e5e7eb' : '2px solid #667eea') : '2px solid transparent'
            }}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: activeTab === 'groups'
                ? (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(102, 126, 234, 0.2)')
                : 'transparent',
              color: activeTab === 'groups' ? (darkMode ? '#e5e7eb' : '#667eea') : (darkMode ? '#9ca3af' : '#6b7280'),
              fontWeight: activeTab === 'groups' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderBottom: activeTab === 'groups' ? (darkMode ? '2px solid #e5e7eb' : '2px solid #667eea') : '2px solid transparent'
            }}
          >
            Groups
          </button>
        </div>

        {/* Group View */}
        {activeTab === 'groups' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedGroup ? (
              <GroupChatPage
                user={user}
                groupId={selectedGroup.id || selectedGroup._id}
                onBack={handleBackFromGroup}
                theme={theme}
              />
            ) : (
              <GroupListPanel
                user={user}
                onSelectGroup={handleSelectGroup}
                selectedGroupId={selectedGroup?.id}
                onCreateGroup={() => setShowCreateGroupModal(true)}
              />
            )}
          </div>
        )}

        {/* Existing 1-to-1 Chat View */}
        {activeTab === 'chats' && (
          <>
            {/* Wallpaper Layer */}
            <NotificationManager />
            {wallpaperActive && resolvedWallpaperUrl && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: wallpaperIsGradient ? resolvedWallpaperUrl : `url(${resolvedWallpaperUrl})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  opacity: wallpaperPreview.opacity ?? 0.9,
                  transition: 'opacity 0.2s ease',
                  zIndex: 0,
                  pointerEvents: 'none'
                }}
              />
            )}

            <ChatHeader
              otherUser={otherUser}
              connectionStatus={connectionStatus}
              typingUser={typingUser}
              isReconnecting={isReconnecting}
              reconnectAttempts={reconnectAttempts}
              theme={theme}
              availableUsers={availableUsers}
              setShowOtherUserModal={setShowOtherUserModal}
              setShowSearchModal={setShowSearchModal}
              user={user}
              messages={messages}
              colors={colors}
              onStartVoiceCall={startVoiceCall}
              onStartVideoCall={startVideoCall}
              voiceCallState={voiceCallState}
              videoCallState={videoCallState}
              otherUserOnline={otherUserOnline}
              onLogout={onLogout}
              onAvatarUpdate={handleAvatarUpdate}
              onProfileUpdate={onUserUpdate}
              onOpenWallpaper={openWallpaperPanel}
              wallpaperActive={wallpaperActive}
              onOpenLightbox={handleOpenLightbox}
            />

            {/* Status Banners */}
            {realConnectionStatus !== 'connected' && (
              <div style={{ padding: '8px', backgroundColor: realConnectionStatus === 'reconnecting' ? '#f59e0b' : '#ef4444', color: 'white', textAlign: 'center', zIndex: 10 }}>
                {realConnectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
              </div>
            )}
            {showRateLimitWarning && (
              <div style={{ padding: '8px', backgroundColor: '#fbbf24', color: '#78350f', textAlign: 'center', zIndex: 10 }}>
                Too many messages. Wait {rateLimitRetryAfter}s.
              </div>
            )}

            {/* Messages Area */}
            <div
              ref={chatContainerRef}
              onScroll={handleScroll}
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                background: wallpaperActive ? 'transparent' : colors.bg,
                position: 'relative',
                willChange: 'transform',
                zIndex: 1
              }}
            >
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', zIndex: 1 }}>
                <ChatMessages
                  messages={messages}
                  user={user}
                  otherUser={otherUser}
                  onEdit={setEditingMessage}
                  onDelete={onDelete}
                  onReply={(m) => { setReplyingTo(m); }}
                  onOpenLightbox={handleOpenLightbox}
                  onForward={(m) => { setForwardingMessage(m); setShowForwardModal(true); }}
                  colors={colors}
                  theme={theme}
                />
                <TypingIndicator typingUser={typingUser} colors={colors} />
              </div>

              {userScrolledUp && (
                <ScrollToBottomButton onClick={() => { scrollToBottom(); setUserScrolledUp(false); }} />
              )}
              <div ref={messagesEndRef} />
            </div>

            <ComposeBar
              text={text}
              setText={setText}
              onTyping={() => onTypingHook(otherUserId, conversationId)}
              otherUser={otherUser}
              uploading={uploading}
              selectFile={selectFile}
              uploadFile={uploadFile}
              recording={recording}
              startRecording={startRecording}
              stopRecording={stopRecording}
              sending={sending}
              editingMessage={editingMessage}
              cancelEdit={() => setEditingMessage(null)}
              replyingTo={replyingTo}
              cancelReply={() => setReplyingTo(null)}
              send={sendMessage}
              connectionStatus={connectionStatus}
              colors={colors}
              currentUserId={user.id}
              theme={theme}
            />

            {showOtherUserModal && (
              <UserSelectModal
                show={true}
                availableUsers={availableUsers}
                onClose={() => setShowOtherUserModal(false)}
                onSelect={handleUserSelect}
                currentUserId={user.id}
                darkMode={darkMode}
              />
            )}

            {showForwardModal && (
              <UserSelectModal
                show={true}
                availableUsers={availableUsers.filter(u => u.id !== user.id)}
                onClose={() => setShowForwardModal(false)}
                onSelect={async (targetId) => {
                  try {
                    if (!forwardingMessage) return;
                    const id = forwardingMessage.id || forwardingMessage._id;
                    const res = await forwardMessage({ messageId: id, targetUserId: targetId });
                    const newMessages = res.data?.messages || [];
                    if (otherUserId === targetId) {
                      setMessages(prev => mergeMessages(prev, newMessages));
                      setTimeout(() => scrollToBottom(), 50);
                    }
                    // Auto-switch to the target user's chat
                    handleUserSelect(targetId);

                    setShowForwardModal(false);
                    setForwardingMessage(null);
                  } catch (err) {
                    console.error('Forward failed:', err);
                    toast.error(err.response?.data?.message || 'Failed to forward message');
                  }
                }}
                currentUserId={user.id}
                darkMode={darkMode}
                title="Forward Message"
              />
            )}

            {showSearchModal && (
              <SmartSearch
                conversationId={conversationId}
                onClose={() => setShowSearchModal(false)}
                onResultClick={(message) => {
                  // Implementation would need to find message in history or load it
                  console.log('Navigate to:', message.id);
                  // Optional: Implement scroll to message logic here
                }}
                darkMode={darkMode}
              />
            )}

            {lightbox.visible && (
              <Lightbox
                url={lightbox.url}
                type={lightbox.type}
                filename={lightbox.filename}
                onClose={() => setLightbox({ visible: false, url: null, type: null })}
              />
            )}

            {wallpaperPanelOpen && (
              <WallpaperPanel
                open={wallpaperPanelOpen}
                onClose={closeWallpaperPanel}
                value={wallpaperPreview}
                onChange={setWallpaperPreview}
                onSave={async (draft) => {
                  try {
                    // Optimistic visual update
                    setWallpaperPreview(draft);
                    setSavingWallpaper(true);

                    await saveWallpaper(conversationId, draft);

                    setWallpaperSettings(draft);
                    closeWallpaperPanel();
                  } catch (err) {
                    console.error('Failed to save wallpaper', err);
                    // Revert preview on error
                    setWallpaperPreview(wallpaperSettings);
                  } finally {
                    setSavingWallpaper(false);
                  }
                }}
                saving={savingWallpaper}
                presets={wallpaperPresets}
              />
            )}

            {(incomingVoiceCall || voiceCallState !== 'idle') && <VoiceCallModal
              callState={voiceCallState}
              incomingCall={incomingVoiceCall}
              callDuration={voiceCallDuration}
              otherUser={incomingVoiceCall?.caller || otherUser}
              onAnswer={answerVoiceCall}
              onReject={rejectVoiceCall}
              onEnd={endVoiceCall}
              localStreamRef={voiceLocalStreamRef}
              remoteStreamRef={voiceRemoteStreamRef}
              colors={colors}
            />}

            {(incomingVideoCall || videoCallState !== 'idle') && (
              <VideoCallModal
                callState={videoCallState}
                incomingCall={incomingVideoCall}
                callDuration={videoCallDuration}
                otherUser={incomingVideoCall?.caller || otherUser}
                isMuted={isMuted}
                isVideoOff={isVideoOff}
                onAnswer={answerVideoCall}
                onReject={rejectVideoCall}
                onEnd={endVideoCall}
                onToggleMute={toggleMute}
                onToggleVideo={toggleVideo}
                localStream={videoLocalStream}
                remoteStream={videoRemoteStream}
                colors={colors}
              />
            )}
            <OnboardingTour isOpen={showTour} onClose={handleTourClose} />
          </>
        )}

        {/* Create Group Modal */}
        <CreateGroupModal
          show={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          onCreateGroup={handleCreateGroup}
          contacts={availableUsers}
        />
      </div>
    </div>
  );
}
