import { useCallback, useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getConnectionStatus, sendSocketMessage } from '../services/socket';
import { mergeMessages } from '../utils/chatUtils';

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
  encryption // Added for E2EE support
}) {
  const healthIntervalRef = useRef(null);

  // Refs for dependencies that change often but shouldn't trigger reconnects
  const availableUsersRef = useRef(availableUsers);
  const setMessagesRef = useRef(setMessages);
  const setTypingUserRef = useRef(setTypingUser);
  const encryptionRef = useRef(encryption);
  const reconnectRef = useRef(null);
  const isAuthErrorRef = useRef(false);

  // Update refs when props change
  useEffect(() => {
    availableUsersRef.current = availableUsers;
    setMessagesRef.current = setMessages;
    setTypingUserRef.current = setTypingUser;
    encryptionRef.current = encryption;
    reconnectRef.current = reconnectWebSocket;
  }, [availableUsers, setMessages, setTypingUser, encryption, reconnectWebSocket]);

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
      if (message.senderId !== userId) {
        const sender = availableUsersRef.current.find(u => u.id === message.senderId);
        setTypingUserRef.current(sender ? (sender.displayName || sender.username) : 'Someone');
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
                // Optionally trigger a logout or token refresh action here if passed as prop
              },
              onConnectionLost: (error) => {
                connectedRef.current = false;
                setConnectionStatus('disconnected');
                // Only reconnect if NOT an auth connection error (handled by onAuthError usually, but double check)
                if (error && (error.message || '').includes('jwt expired')) {
                  return; // Stop reconnecting
                }
                setTimeout(() => { if (!connectedRef.current) reconnectWebSocket(); }, 2000);
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
      try { disconnectSocket(); } catch { }
      clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
