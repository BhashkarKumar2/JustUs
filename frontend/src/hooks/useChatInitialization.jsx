import { useState, useEffect } from 'react';
import api, { setAuthToken } from '../services/api';
import { mergeMessages } from '../utils/chatUtils';

export default function useChatInitialization(user, encryption, markMessagesAsRead) {
    const [messages, setMessages] = useState([]);
    const [conversationId, setConversationId] = useState(null);
    const [otherUserId, setOtherUserId] = useState(localStorage.getItem('otherUserId') || '');
    const [otherUser, setOtherUser] = useState(null);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Helper to decrypt messages
    const setMessagesWithDecryption = (rawMessages) => {
        const decrypted = rawMessages.map(msg => {
            if (msg.ciphertext && msg.nonce && encryption.getKeyPair()) {
                try {
                    // Try to get sender key from cache or context
                    // Note: encryption hook should ideally handle key lookup automatically
                    // For now, we assume user IDs are available
                    const senderPublicKey = encryption.getPublicKeyForUser(msg.senderId);
                    if (senderPublicKey) {
                        const decryptedContent = encryption.decryptMessage(msg.ciphertext, msg.nonce, senderPublicKey);
                        if (decryptedContent) {
                            return { ...msg, content: decryptedContent, encrypted: true };
                        }
                    }
                } catch (err) {
                    // console.error('Failed to decrypt message:', err);
                }
            }
            return msg;
        });
        setMessages(decrypted);
    };

    // Switch conversation when otherUserId changes
    useEffect(() => {
        let isActive = true;

        const safeReload = async () => {
            if (!otherUserId || otherUserId === 'undefined' || otherUserId === 'null') return;

            console.log('[User Switch] Reloading conversation for:', otherUserId);

            try {
                if (!isActive) return;
                setMessages([]);
                setHasMoreMessages(true);
                setLoading(true);

                const found = availableUsers.find(u => u.id === otherUserId);
                if (found && isActive) setOtherUser(found);

                const authenticatedApi = api;
                const conv = await authenticatedApi.post('/api/chat/conversation?other=' + otherUserId);

                if (!isActive) return;
                const newConversationId = conv.data._id || conv.data.id;
                setConversationId(newConversationId);

                const res = await authenticatedApi.get('/api/chat/messages?limit=50&conversationId=' + newConversationId);

                if (!isActive) return;
                setHasMoreMessages(res.data.length === 50);

                const decryptedMessages = await Promise.all(
                    res.data.map(async (msg) => {
                        if (msg.encryptionNonce && msg.content) {
                            try {
                                const { content, decrypted } = await encryption.decryptMessage(
                                    msg.content,
                                    msg.encryptionNonce,
                                    otherUserId
                                );
                                return { ...msg, content, decrypted };
                            } catch (e) {
                                return msg;
                            }
                        }
                        return msg;
                    })
                );

                if (!isActive) return;

                const standardDecrypted = decryptedMessages.map(msg => {
                    if (msg.ciphertext && msg.nonce) {
                        const pubKey = encryption.getPublicKeyForUser(msg.senderId);
                        if (pubKey) {
                            const decrypted = encryption.decryptMessage(msg.ciphertext, msg.nonce, pubKey);
                            return decrypted ? { ...msg, content: decrypted, encrypted: true } : msg;
                        }
                    }
                    return msg;
                });

                setMessages(standardDecrypted);
                setLoading(false);
            } catch (error) {
                if (isActive) {
                    console.error('[User Switch] Failed:', error);
                    setLoading(false);
                }
            }
        };

        if (availableUsers.length > 0 && otherUserId) {
            safeReload();
        }

        return () => {
            isActive = false;
        };
    }, [otherUserId, availableUsers]); // Dependency strictly on ID change

    // Initial startup
    useEffect(() => {
        const initializeChat = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    setLoading(false);
                    return;
                }
                setAuthToken(token);

                const authenticatedApi = api;
                const usersRes = await authenticatedApi.get('/api/auth/users');
                const users = usersRes.data;
                setAvailableUsers(users);

                let otherId = otherUserId;
                if (!otherId) {
                    const systemUser = users.find(u => u.id === '000000000000000000000000');
                    const firstContact = users.find(u => u.id !== user.id && u.id !== '000000000000000000000000');
                    const pick = systemUser || firstContact;
                    if (pick) {
                        otherId = pick.id;
                        setOtherUserId(otherId);
                        setOtherUser(pick);
                        localStorage.setItem('otherUserId', otherId);
                    }
                } else {
                    const found = users.find(u => u.id === otherId);
                    setOtherUser(found || null);
                }

                // The useEffect above will handle the actual conversation load since we setOtherUserId/AvailableUsers
                // But for the very first load, the effect might race or not trigger if availableUsers wasn't ready.
                // Actually, setting availableUsers WILL trigger the effect. So we can stop here.
                // BUT, we need to make sure we don't trigger it twice.
                // Let's rely on the effect.

            } catch (e) {
                console.error('Data load failed', e);
                if (e.response?.status === 401) {
                    window.location.href = '/signin';
                }
                setLoading(false);
            }
        };
        initializeChat();
    }, []); // Run once

    // Cleanup old messages
    useEffect(() => {
        const interval = setInterval(() => {
            setMessages(prev => prev.map(msg => {
                if (msg.temporary && msg.timestamp) {
                    if (Date.now() - new Date(msg.timestamp).getTime() > 15000) {
                        return { ...msg, temporary: false };
                    }
                }
                return msg;
            }));
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadMoreMessages = async () => {
        if (loadingMore || !hasMoreMessages || !conversationId) return;

        try {
            setLoadingMore(true);
            const oldestMessage = messages[0];
            if (!oldestMessage) {
                setLoadingMore(false);
                return;
            }

            const authenticatedApi = api;
            const res = await authenticatedApi.get('/api/chat/messages', {
                params: {
                    conversationId,
                    limit: 50,
                    before: oldestMessage.timestamp
                }
            });

            const newMessages = res.data;
            if (newMessages.length < 50) setHasMoreMessages(false);

            const decryptedChunk = newMessages.map(msg => {
                if (msg.ciphertext && msg.nonce) {
                    try {
                        const senderPublicKey = encryption.getPublicKeyForUser(msg.senderId);
                        if (senderPublicKey) {
                            const decryptedContent = encryption.decryptMessage(msg.ciphertext, msg.nonce, senderPublicKey);
                            if (decryptedContent) return { ...msg, content: decryptedContent, encrypted: true };
                        }
                    } catch (err) { /* Decryption failure - silently skip */ }
                }
                return msg;
            });

            setMessages(prev => mergeMessages(prev, decryptedChunk));
        } catch (error) {
            console.error('Error loading more messages:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    return {
        messages,
        setMessages,
        conversationId,
        otherUser,
        otherUserId,
        setOtherUserId, // Exposed to allow switching
        availableUsers,
        loading,
        hasMoreMessages,
        loadingMore,
        loadMoreMessages
    };
}
