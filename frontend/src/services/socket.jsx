import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import CryptoService from './crypto';
import { notifyDesktop, getUserIdFromToken } from '../utils/desktopNotify';

// Use environment variable for WebSocket URL, fallback to localhost. In production (served by backend), use relative (undefined).
// Use environment variable for WebSocket URL, fallback to API URL or localhost
let WS_URL = process.env.REACT_APP_WS_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Auto-upgrade to WSS if running on HTTPS (Mixed Content Fix)
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && WS_URL.startsWith('ws://')) {
  WS_URL = WS_URL.replace('ws://', 'wss://');
} else if (typeof window !== 'undefined' && window.location.protocol === 'https:' && WS_URL.startsWith('http://')) {
  WS_URL = WS_URL.replace('http://', 'https://');
}

let socket = null;
let userPublicKeys = {}; // Cache of userId -> publicKey

// connectSocket() replaces the socket object on every reconnect. Anything that keeps
// listeners on it must follow the current one, or it ends up listening to (and
// emitting into) a dead socket: stale "Disconnected" banners, calls that never ring.
const socketSubscribers = new Set();
function setCurrentSocket(next) {
  socket = next;
  socketSubscribers.forEach(fn => fn());
}
export function subscribeSocket(fn) {
  socketSubscribers.add(fn);
  return () => socketSubscribers.delete(fn);
}
/** React hook: the current Socket.IO instance; re-renders when it is replaced. */
export function useSocket() {
  return useSyncExternalStore(subscribeSocket, getSocket, getSocket);
}

export function connectSocket(token, onMessage, onConnected, handlers = {}) {
  // Still reconnecting by itself: replacing it would only restart the attempt.
  if (socket && !socket.connected && socket.active) {
    return;
  }

  if (socket && socket.connected) {
    console.log('WebSocket already connected');
    // Call onConnected immediately if we're already connected
    if (onConnected) {
      setTimeout(onConnected, 100);
    }
    return;
  }

  // Clean up any existing socket before creating a new one
  if (socket) {
    const old = socket;
    socket = null; // detach first so its disconnect event isn't treated as ours
    try {
      old.disconnect();
    } catch (e) {
      console.log('Error disconnecting existing socket:', e);
    }
  }

  console.log('Creating new Socket.IO connection to:', WS_URL);
  console.log('Token:', token ? 'present' : 'missing');

  // Create Socket.IO connection
  const thisSocket = io(WS_URL, {
    // Evaluated on every (re)connection attempt, so retries and Socket.IO's own
    // auto-reconnect always use the latest token: a token refreshed while the
    // connection was down must not be overtaken by a retry holding the old one.
    auth: (cb) => cb({ token: localStorage.getItem('token') || token }),
    transports: ['websocket', 'polling'],
    // Socket.IO owns transport reconnects (network drops, server restarts) and keeps
    // trying; the app only steps in when the server refuses the connection (e.g.
    // expired token), which ends Socket.IO's own retries (socket.active === false).
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });
  setCurrentSocket(thisSocket);
  const isCurrent = () => socket === thisSocket;

  // Connection event
  socket.on('connect', () => {
    console.log('Socket.IO connected');
    if (!isCurrent()) return;
    if (onConnected) onConnected();
  });

  // Listen for incoming messages
  socket.on('message', (data) => {
    // console.log('Received message:', data);
    if (onMessage) onMessage(data);
  });

  // Desktop app only (no-op in browsers): native toasts + taskbar badge for messages and calls
  const myUserId = getUserIdFromToken(token);
  socket.on('message', (data) => notifyDesktop('message', data, myUserId));
  socket.on('group.message', (data) => notifyDesktop('group.message', data, myUserId));
  socket.on('call.offer', (data) => notifyDesktop('call.offer', data, myUserId));
  socket.on('video-call.offer', (data) => notifyDesktop('video-call.offer', data, myUserId));
  socket.on('call.end', (data) => notifyDesktop('call.end', data, myUserId));
  socket.on('video-call.end', (data) => notifyDesktop('video-call.end', data, myUserId));

  // Listen for edited messages
  socket.on('messages.edited', (data) => {
    console.log('Message edited:', data);
    if (handlers.onEdited) handlers.onEdited(data);
  });

  // Listen for message updates (translations etc)
  socket.on('message.updated', (data) => {
    console.log('Message updated:', data);
    if (handlers.onUpdated) handlers.onUpdated(data);
  });

  // Live location moved / ended
  socket.on('location.updated', (data) => {
    if (handlers.onLocationUpdated) handlers.onLocationUpdated(data);
  });

  // Listen for deleted messages
  socket.on('messages.deleted', (data) => {
    console.log('Message deleted:', data);
    if (handlers.onDeleted) handlers.onDeleted(data);
  });

  // Listen for typing events
  socket.on('typing', (data) => {
    // Falls back to the main message handler, which renders type === 'typing'
    if (handlers.onTyping) handlers.onTyping(data);
    else if (onMessage) onMessage({ ...data, type: 'typing' });
  });

  // Listen for user status (online/offline)
  socket.on('user:status', (data) => {
    console.log('User status changed:', data);
    if (handlers.onUserStatus) handlers.onUserStatus(data);
  });

  // Listen for key exchange offer
  socket.on('crypto.key-offer', (data) => {
    console.log('Received public key from:', data.userId);
    userPublicKeys[data.userId] = data.publicKey;
    if (handlers.onKeyExchange) handlers.onKeyExchange(data);
  });

  // Listen for read receipts
  socket.on('MESSAGE_READ', (data) => {
    console.log('Message read:', data);
    if (handlers.onRead) handlers.onRead(data.message);
  });

  // Disconnect event
  socket.on('disconnect', (reason) => {
    console.log('Socket.IO disconnected:', reason);
    if (!isCurrent()) return; // an old socket we replaced on purpose
    if (handlers.onConnectionLost) {
      setTimeout(() => {
        handlers.onConnectionLost();
      }, 500);
    }
  });

  // Connection error
  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    if (!isCurrent()) return;
    // Check if it's an authentication error
    const isAuthError = error.message.includes('token') ||
      error.message.includes('jwt') ||
      error.message.includes('unauthorized');

    if (handlers.onConnectionError) {
      handlers.onConnectionError(error);
    }

    if (handlers.onConnectionLost) {
      // Don't auto-reconnect if it's an auth error - let the app handle it (login redirect)
      if (!isAuthError) {
        setTimeout(() => {
          handlers.onConnectionLost(error);
        }, 500);
      } else {
        console.warn('Authentication error detected, stopping socket reconnection loop');
        if (handlers.onAuthError) handlers.onAuthError(error);
      }
    }
  });

  // General error
  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
  });
}

export function sendSocketMessage(message) {
  if (!socket) {
    console.error('Cannot send message - Socket not initialized');
    return false;
  }

  if (!socket.connected) {
    console.error('Cannot send message - Socket not connected');
    return false;
  }

  let eventName = 'chat.send';
  if (message.type === 'delete') eventName = 'chat.delete';
  else if (message.type === 'typing') eventName = 'chat.typing';
  else if (message.id && message.type === 'text') eventName = 'chat.edit';

  console.log('Sending message with event:', eventName, ':', message);

  try {
    socket.emit(eventName, message);
    // console.log('Message sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send Socket.IO message:', error);
    return false;
  }
}

/**
 * Exchange public key with server for E2EE
 * @param {Object} keyPair - { publicKey, secretKey }
 */
export function exchangePublicKey(keyPair) {
  if (!socket || !socket.connected) {
    console.warn('Socket not connected yet, will retry key exchange when connected');

    // Wait for socket to connect and retry
    const retryExchange = () => {
      if (socket && socket.connected) {
        try {
          socket.emit('crypto.exchange-key', {
            publicKey: keyPair.publicKey
          });
          console.log('Public key exchanged (after retry)');
        } catch (error) {
          console.error('Failed to exchange public key:', error);
        }
      }
    };

    // Retry after a short delay
    setTimeout(retryExchange, 1000);
    return false;
  }

  try {
    socket.emit('crypto.exchange-key', {
      publicKey: keyPair.publicKey
    });
    console.log('Public key exchanged');
    return true;
  } catch (error) {
    console.error('Failed to exchange public key:', error);
    return false;
  }
}

/**
 * Get cached public key for a user
 * @param {string} userId
 * @returns {string|null}
 */
export function getPublicKey(userId) {
  return userPublicKeys[userId] || null;
}

/**
 * Send encrypted message
 * @param {Object} messageData - { content, receiverId, conversationId, type, ... }
 * @param {string} senderSecretKey - Base64 encoded secret key
 * @param {string} receiverPublicKey - Base64 encoded public key
 * @returns {boolean}
 */
export function sendEncryptedMessage(messageData, senderSecretKey, receiverPublicKey) {
  try {
    const { ciphertext, nonce } = CryptoService.encrypt(
      messageData.content,
      senderSecretKey,
      receiverPublicKey
    );

    const encryptedMessage = {
      ...messageData,
      ciphertext,
      nonce,
      content: undefined  // Don't send plaintext
    };

    return sendSocketMessage(encryptedMessage);
  } catch (error) {
    console.error('Failed to encrypt and send message:', error);
    return false;
  }
}

/**
 * Decrypt message
 * @param {Object} message - Message from server
 * @param {string} senderPublicKey - Base64 encoded sender's public key
 * @param {string} receiverSecretKey - Base64 encoded receiver's secret key
 * @returns {string} Decrypted content
 */
export function decryptMessage(message, senderPublicKey, receiverSecretKey) {
  try {
    if (!message.ciphertext || !message.nonce) {
      console.warn('Message is not encrypted');
      return message.content;
    }

    return CryptoService.decrypt(
      message.ciphertext,
      message.nonce,
      senderPublicKey,
      receiverSecretKey
    );
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    return null;
  }
}

export function disconnectSocket() {
  if (socket) {
    try {
      console.log('Disconnecting Socket.IO...');
      socket.disconnect();
      setCurrentSocket(null);
    } catch (e) {
      console.error('Error disconnecting Socket.IO:', e);
    }
  }
}

export function getConnectionStatus() {
  if (!socket) return 'disconnected';
  if (socket.connected) return 'connected';
  if (socket.active) return 'connecting'; // Socket.IO is retrying on its own
  return 'disconnected';
}

export function isWebSocketConnected() {
  return socket && socket.connected;
}

export function getSocket() {
  return socket;
}
