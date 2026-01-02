import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../services/socket';
import CryptoService from '../services/crypto';

/**
 * SDE 3: WebSocket Reconnection Hook
 * Handles connection state, automatic sync on reconnect, and rate limit errors
 */
export const useReconnection = ({ userId, otherUserId, conversationId, messages, setMessages }) => {
    const [connectionStatus, setConnectionStatus] = useState('connected');
    const [showRateLimitWarning, setShowRateLimitWarning] = useState(false);
    const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState(0);
    const lastMessageIdRef = useRef(null);
    const wasDisconnectedRef = useRef(false); // CRITICAL: Track if we actually disconnected
    const currentConversationRef = useRef(conversationId); // CRITICAL: Track current conversation

    useEffect(() => {
        if (!userId) return;

        const socket = getSocket();
        if (!socket) return;

        // CRITICAL: Update conversation ref when it changes
        currentConversationRef.current = conversationId;

        // Track last seen message for sync
        if (messages && messages.length > 0) {
            const sortedMessages = [...messages].sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            lastMessageIdRef.current = sortedMessages[0]?.id;
        }

        // Handle disconnect
        const handleDisconnect = (reason) => {
            console.log('[Reconnection] Disconnected:', reason);
            setConnectionStatus('disconnected');
            wasDisconnectedRef.current = true; // Mark that we disconnected

            if (reason === 'io server disconnect') {
                // Server terminated connection, reconnect manually
                socket.connect();
            }
        };

        // Handle reconnect attempt
        const handleReconnectAttempt = () => {
            console.log('[Reconnection] Attempting to reconnect...');
            setConnectionStatus('reconnecting');
        };

        // Handle successful reconnect
        const handleConnect = () => {
            console.log('[Reconnection] Connected.');
            setConnectionStatus('connected');

            // CRITICAL FIX: Only sync if we actually disconnected before
            // Don't sync on initial load or conversation changes
            if (wasDisconnectedRef.current) {
                console.log('[Reconnection] Was disconnected, requesting sync...');
                socket.emit('message:sync', {
                    lastMessageId: lastMessageIdRef.current
                });
                wasDisconnectedRef.current = false; // Reset flag
            } else {
                console.log('[Reconnection] Initial connect or conversation change, skipping sync');
            }
        };

        // Handle sync response
        const handleSyncResponse = async ({ messages: missedMessages, count }) => {
            if (count === 0) {
                console.log('[Reconnection] No missed messages');
                return;
            }

            console.log(`[Reconnection] Received ${count} missed messages. Validating conversation...`);

            // CRITICAL FIX: Validate messages belong to current conversation
            // Filter out messages from old conversations (in case of race condition)
            const validMessages = missedMessages.filter(msg =>
                msg.conversationId === currentConversationRef.current
            );

            if (validMessages.length === 0) {
                console.log('[Reconnection] All synced messages are from old conversation, ignoring');
                return;
            }

            if (validMessages.length < count) {
                console.warn(`[Reconnection] Filtered out ${count - validMessages.length} messages from old conversation`);
            }

            console.log(`[Reconnection] Processing ${validMessages.length} valid messages for current conversation`);

            try {
                // Decrypt messages if E2EE is enabled
                const decryptedMissedMessages = await Promise.all(
                    validMessages.map(async (msg) => {
                        if (msg.encryptionNonce && msg.content) {
                            try {
                                const { content, decrypted } = await CryptoService.decryptMessage(
                                    msg.content,
                                    msg.encryptionNonce,
                                    otherUserId
                                );
                                return { ...msg, content, decrypted };
                            } catch (e) {
                                console.error('[Reconnection] Failed to decrypt message:', e);
                                return msg; // Return encrypted if decryption fails
                            }
                        }
                        return msg;
                    })
                );

                // Merge with existing messages (avoid duplicates)
                setMessages((prevMessages) => {
                    const existingIds = new Set(prevMessages.map(m => m.id));
                    const newMessages = decryptedMissedMessages.filter(m => !existingIds.has(m.id));

                    // Combine and sort by timestamp
                    const merged = [...prevMessages, ...newMessages].sort(
                        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
                    );

                    console.log(`[Reconnection] Merged ${newMessages.length} new messages`);
                    return merged;
                });

            } catch (error) {
                console.error('[Reconnection] Error processing sync:', error);
            }
        };

        // Handle rate limit error
        const handleRateLimitError = ({ message, retryAfter }) => {
            console.warn('[RateLimit] Message blocked:', message);
            setShowRateLimitWarning(true);
            setRateLimitRetryAfter(retryAfter);

            // Auto-hide warning after retryAfter seconds
            setTimeout(() => {
                setShowRateLimitWarning(false);
            }, retryAfter * 1000);
        };

        // Attach listeners
        socket.on('disconnect', handleDisconnect);
        socket.on('reconnect_attempt', handleReconnectAttempt);
        socket.on('connect', handleConnect);
        socket.on('message:sync_response', handleSyncResponse);
        socket.on('error:rate_limit', handleRateLimitError);

        // Cleanup
        return () => {
            socket.off('disconnect', handleDisconnect);
            socket.off('reconnect_attempt', handleReconnectAttempt);
            socket.off('connect', handleConnect);
            socket.off('message:sync_response', handleSyncResponse);
            socket.off('error:rate_limit', handleRateLimitError);
        };
    }, [userId, otherUserId, conversationId, messages, setMessages]);

    return {
        connectionStatus,
        showRateLimitWarning,
        rateLimitRetryAfter
    };
};
