import { useCallback, useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getConnectionStatus, getSocket, sendSocketMessage } from '../services/socket';
import { refreshAccessToken, forceLogout } from '../services/api';

// Only rebuild the socket when Socket.IO has given up (server refused it / none exists);
// while it is still retrying on its own, a new socket would just restart the attempt.
const socketNeedsRebuild = () => { const s = getSocket(); return !s || (!s.connected && !s.active); };
import { mergeMessages } from '../utils/chatUtils';
import { applyLocationUpdate } from '../utils/location';
import '../services/liveLocation'; // app-wide live-location sender: must exist before the first socket

export default function useChatSocket({
  token,
  userId,
  availableUsers,
  setMessages,
  setTypingUser,
  setConnectionStatus,
  setReconnectAttempts,
  isReconnecting,
  setIsReconnecting,
  connectedRef,
  typingTimeoutRef,
  onUserStatusChange,
  encryption, // Added for E2EE support
  activeChatUserId // the contact whose chat is open (typing indicator is scoped to it)
}) {
  const healthIntervalRef = useRef(null);

  // Refs for dependencies that change often but shouldn't trigger reconnects
  const availableUsersRef = useRef(availableUsers);
  const setMessagesRef = useRef(setMessages);
  const setTypingUserRef = useRef(setTypingUser);
  const encryptionRef = useRef(encryption);
  const activeChatUserIdRef = useRef(activeChatUserId);
  const reconnectRef = useRef(null);
  const isAuthErrorRef = useRef(false);



  const handleWebSocketMessage = useCallback((message) => {
    if (message && message.type && message.type.startsWith('system:')) return;

    // Read receipts
    if (message.type === 'MESSAGE_READ') {
      setMessagesRef.current(prev => prev.map(msg =>
        msg.id === message.message.id ? { ...msg, read: true, readAt: message.message.readAt } : msg
      ));
      return;
    }

    // Deletion
    if (message.type === 'MESSAGE_DELETED' || message.type === 'delete') {
      const messageIdToDelete = message.messageId || message.id;
      setMessagesRef.current(prev => prev.filter(msg => msg.id !== messageIdToDelete));
      return;
    }

    // Typing indicator
    if (message.type === 'typing') {
      if (message.senderId !== userId && message.senderId === activeChatUserIdRef.current) {
        const sender = availableUsersRef.current.find(u => u.id === message.senderId);
        setTypingUserRef.current(sender ? (sender.displayName || sender.username) : (message.username || 'Someone'));
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUserRef.current(null), 3000);
      }
      return;
    }

    // Real messages
    if (message.id && !message.temporary) {
      console.log('[Frontend] Received Socket Message:', {
        id: message.id,
        type: message.type,
        content: message.content,
        translatedText: message.translatedText,
        translatedLanguage: message.translatedLanguage,
        originalLanguage: message.originalLanguage
      });

      setMessagesRef.current(prev => {
        // E2EE Decryption for incoming socket message
        if (message.ciphertext && message.nonce && encryptionRef.current) {
          try {
            // We need sender's public key. 
            // Assuming encryption hook provides getPublicKeyForUser or we can get it from availableUsers (but keys are usually separate).
            // efficient way: use the helper from encryption hook if available
            const senderKey = encryptionRef.current.getPublicKeyForUser(message.senderId);
            if (senderKey) {
              const decrypted = encryptionRef.current.decryptMessage(message.ciphertext, message.nonce, senderKey);
              if (decrypted) {
                message.content = decrypted;
                message.encrypted = true;
              }
            }
          } catch (e) {
            console.error('Socket message decryption failed', e);
          }
        }

        // Use strict merge which handles sorting and deduplication
        return mergeMessages(prev, [message]);
      });
    }
  }, [userId, typingTimeoutRef]); // deeply stable dependencies only

  const reconnectWebSocket = useCallback(async () => {
    if (isReconnecting) return;
    const maxRetries = 5;
    const baseDelay = 1000;
    const maxDelay = 30000;
    setIsReconnecting(true);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        setReconnectAttempts(attempt + 1);
        setConnectionStatus('connecting');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
          connectSocket(token,
            (message) => handleWebSocketMessage(message),
            () => {
              clearTimeout(timeout);
              resolve();
              connectedRef.current = true;
              setConnectionStatus('connected');
            },
            {
              onDeleted: (deletedMessage) => {
                const messageIdToDelete = deletedMessage.id;
                setMessagesRef.current(prev => prev.filter(msg => msg.id !== messageIdToDelete));
              },
              onEdited: (editedMessage) => {
                setMessagesRef.current(prev => prev.map(msg => msg.id === editedMessage.id ? { ...msg, content: editedMessage.content } : msg));
              },
              onLocationUpdated: (update) => {
                setMessagesRef.current(prev => applyLocationUpdate(prev, update));
              },
              onUpdated: (updatedMessage) => {
                console.log('[Frontend] Message Updated (Translation):', updatedMessage.id);
                setMessagesRef.current(prev => {
                  // Ensure we don't introduce duplicates when updating
                  const index = prev.findIndex(m => m.id === updatedMessage.id);
                  if (index === -1) return prev; // Not found, don't just append randomly unless necessary

                  const newMessages = [...prev];
                  newMessages[index] = { ...newMessages[index], ...updatedMessage };
                  return newMessages;
                });
              },
              onUserStatus: (statusData) => {
                if (onUserStatusChange) {
                  onUserStatusChange(statusData);
                }
              },
              // New handler for Auth errors
              onAuthError: (error) => {
                console.error('Socket Authentication Failed:', error);
                setConnectionStatus('auth_error');
                isAuthErrorRef.current = true;
                setIsReconnecting(false);
                setReconnectAttempts(0);
                // Usually the 15-min access token expired while the socket was down.
                // Refresh it: success fires 'auth:token-changed', which reconnects below.
                refreshAccessToken().catch((err) => {
                  const status = err?.response?.status;
                  if (status === 401 || status === 403) {
                    forceLogout(); // refresh token expired/revoked: sign in again
                  } else {
                    isAuthErrorRef.current = false; // network trouble: let the health check retry
                  }
                });
              },
              onConnectionLost: (error) => {
                connectedRef.current = false;
                setConnectionStatus('disconnected');
                // Only reconnect if NOT an auth connection error (handled by onAuthError usually, but double check)
                if (error && (error.message || '').includes('jwt expired')) {
                  return; // Stop reconnecting
                }
                setTimeout(() => { if (!connectedRef.current && socketNeedsRebuild()) reconnectWebSocket(); }, 2000);
              }
            }
          );
        });
        setReconnectAttempts(0);
        setIsReconnecting(false);
        return;
      } catch (err) {
        if (attempt < maxRetries - 1) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          await new Promise(res => setTimeout(res, delay));
        }
      }
    }
    setIsReconnecting(false);
    setConnectionStatus('disconnected');
  }, [token, isReconnecting, setIsReconnecting, setReconnectAttempts, setConnectionStatus, connectedRef, handleWebSocketMessage, onUserStatusChange]);

  // Update refs when props change
  useEffect(() => {
    availableUsersRef.current = availableUsers;
    setMessagesRef.current = setMessages;
    setTypingUserRef.current = setTypingUser;
    encryptionRef.current = encryption;
    reconnectRef.current = reconnectWebSocket;
    activeChatUserIdRef.current = activeChatUserId;
  }, [availableUsers, setMessages, setTypingUser, encryption, reconnectWebSocket, activeChatUserId]);

  useEffect(() => {
    if (!token) return;

    // Connect once when token changes
    reconnectWebSocket();

    // Health check - but don't include reconnectWebSocket in the interval to avoid loops
    healthIntervalRef.current = setInterval(() => {
      const currentStatus = getConnectionStatus();
      if (currentStatus !== 'connected' && currentStatus !== 'connecting') {
        // If we are disconnected and NOT in an auth error state, try to reconnect
        if (!isAuthErrorRef.current) {
          console.log('[Frontend] Health Check: Socket disconnected, triggering reconnect...');
          setConnectionStatus('reconnecting');
          if (reconnectRef.current) {
            reconnectRef.current();
          }
        }
      } else if (currentStatus === 'connected') {
        setConnectionStatus('connected');
        isAuthErrorRef.current = false; // Reset auth error flag on successful connection
      }
    }, 5000); // Check every 5 seconds (more frequent for better responsiveness)

    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
      try { disconnectSocket(); } catch { /* Cleanup - ignore disconnect errors */ }
      clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Listen for token refresh events from api.jsx
  useEffect(() => {
    const handleTokenChange = (event) => {
      const newToken = event.detail.token;
      if (newToken && newToken !== token) {
        console.log('[useChatSocket] Token refreshed, reconnecting socket...');
        // We can't update the 'token' prop directly as it comes from parent, 
        // but we can force a reconnect with the new token via our ref/reconnect logic.
        // Ideally, the parent component should also update, but this ensures immediate socket fix.

        // Disconnect existing
        disconnectSocket();

        // Reconnect with new token
        connectSocket(newToken,
          (message) => handleWebSocketMessage(message),
          () => {
            connectedRef.current = true;
            setConnectionStatus('connected');
            setIsReconnecting(false);
            setReconnectAttempts(0);
            isAuthErrorRef.current = false;
          },
          // Re-use the same handlers
          {
            onDeleted: (deletedMessage) => {
              const messageIdToDelete = deletedMessage.id;
              setMessagesRef.current(prev => prev.filter(msg => msg.id !== messageIdToDelete));
            },
            onEdited: (editedMessage) => {
              setMessagesRef.current(prev => prev.map(msg => msg.id === editedMessage.id ? { ...msg, content: editedMessage.content } : msg));
            },
            onLocationUpdated: (update) => {
              setMessagesRef.current(prev => applyLocationUpdate(prev, update));
            },
            onUpdated: (updatedMessage) => {
              setMessagesRef.current(prev => {
                const index = prev.findIndex(m => m.id === updatedMessage.id);
                if (index === -1) return prev;
                const newMessages = [...prev];
                newMessages[index] = { ...newMessages[index], ...updatedMessage };
                return newMessages;
              });
            },
            onUserStatus: (statusData) => {
              if (onUserStatusChange) onUserStatusChange(statusData);
            },
            onAuthError: (error) => {
              console.error('Socket Authentication Failed (after refresh):', error);
              setConnectionStatus('auth_error');
              isAuthErrorRef.current = true;
              setIsReconnecting(false);
            },
            onConnectionLost: (error) => {
              connectedRef.current = false;
              setConnectionStatus('disconnected');
              if (error && (error.message || '').includes('jwt expired')) return;
              setTimeout(() => { if (!connectedRef.current && socketNeedsRebuild()) reconnectWebSocket(); }, 2000);
            }
          }
        );
      }
    };

    window.addEventListener('auth:token-changed', handleTokenChange);
    return () => {
      window.removeEventListener('auth:token-changed', handleTokenChange);
    };
  }, [token, handleWebSocketMessage, onUserStatusChange, reconnectWebSocket]);

  const lastTypingTimeRef = useRef(0);

  const onTyping = useCallback((targetUserId, targetConversationId) => {
    const now = Date.now();
    if (now - lastTypingTimeRef.current > 1000) {
      lastTypingTimeRef.current = now;
      sendSocketMessage({
        receiverId: targetUserId || 'other',
        type: 'typing',
        content: '',
        conversationId: targetConversationId
      });
    }
  }, []);

  return { onTyping };
}
