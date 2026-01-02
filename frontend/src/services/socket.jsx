import { io } from 'socket.io-client';
import CryptoService from './crypto';

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

export function connectSocket(token, onMessage, onConnected, handlers = {}) {
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
    try {
      socket.disconnect();
    } catch (e) {
      console.log('Error disconnecting existing socket:', e);
    }
  }

  console.log('Creating new Socket.IO connection to:', WS_URL);
  console.log('Token:', token ? 'present' : 'missing');

  // Create Socket.IO connection
  socket = io(WS_URL, {
    auth: {
      token: token
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: 5
  });

  // Connection event
  socket.on('connect', () => {
    console.log('Socket.IO connected');
    if (onConnected) onConnected();
  });

  // Listen for incoming messages
  socket.on('message', (data) => {
    // console.log('Received message:', data);
    if (onMessage) onMessage(data);
  });

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

  // Listen for deleted messages
  socket.on('messages.deleted', (data) => {
    console.log('Message deleted:', data);
    if (handlers.onDeleted) handlers.onDeleted(data);
  });

  // Listen for typing events
  socket.on('typing', (data) => {
    // console.log('User typing:', data);
    if (handlers.onTyping) handlers.onTyping(data);
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
    if (handlers.onConnectionLost) {
      setTimeout(() => {
        handlers.onConnectionLost();
      }, 500);
    }
  });

  // Connection error
  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
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
      socket = null;
    } catch (e) {
      console.error('Error disconnecting Socket.IO:', e);
    }
  }
}

export function getConnectionStatus() {
  if (!socket) return 'disconnected';
  if (socket.connected) return 'connected';
  if (socket.connecting) return 'connecting';
  return 'disconnected';
}

export function isWebSocketConnected() {
  return socket && socket.connected;
}

export function getSocket() {
  return socket;
}
