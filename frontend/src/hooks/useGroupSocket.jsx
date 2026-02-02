import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';

/**
 * Hook for managing group socket events
 */
export const useGroupSocket = (groupId, user) => {
    const [messages, setMessages] = useState([]);
    const [typingUsers, setTypingUsers] = useState(new Map());
    const typingTimeoutRef = useRef(new Map());

    const [connectionStatus, setConnectionStatus] = useState('connected');

    useEffect(() => {
        const socket = getSocket();
        if (!socket) {
            setConnectionStatus('disconnected');
            return;
        }

        // Initial check
        setConnectionStatus(socket.connected ? 'connected' : 'disconnected');

        const handleConnect = () => setConnectionStatus('connected');
        const handleDisconnect = () => setConnectionStatus('disconnected');
        const handleReconnectAttempt = () => setConnectionStatus('reconnecting');

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('reconnect_attempt', handleReconnectAttempt);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('reconnect_attempt', handleReconnectAttempt);
        };
    }, []);

    useEffect(() => {
        if (!groupId || !user?.id) return;

        const socket = getSocket();
        if (!socket) return;

        // Capture ref value for cleanup
        const timeoutMapRef = typingTimeoutRef.current;

        // Join the group room
        socket.emit('group.join', { groupId });

        // Listen for new group messages
        const handleGroupMessage = (message) => {
            if (message.groupId === groupId) {
                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });
            }
        };

        // Listen for typing indicators
        const handleGroupTyping = (data) => {
            if (data.groupId === groupId && data.userId !== user.id) {
                setTypingUsers(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.userId, data.username);
                    return newMap;
                });

                // Clear typing after 3 seconds
                if (timeoutMapRef.has(data.userId)) {
                    clearTimeout(timeoutMapRef.get(data.userId));
                }
                timeoutMapRef.set(data.userId, setTimeout(() => {
                    setTypingUsers(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(data.userId);
                        return newMap;
                    });
                }, 3000));
            }
        };

        // Listen for message deletions
        const handleMessageDeleted = (data) => {
            if (data.groupId === groupId) {
                setMessages(prev =>
                    prev.map(m => m.id === data.messageId ? { ...m, deleted: true } : m)
                );
            }
        };

        socket.on('group.message', handleGroupMessage);
        socket.on('group.typing', handleGroupTyping);
        socket.on('group.message_deleted', handleMessageDeleted);

        return () => {
            socket.emit('group.leave', { groupId });
            socket.off('group.message', handleGroupMessage);
            socket.off('group.typing', handleGroupTyping);
            socket.off('group.message_deleted', handleMessageDeleted);

            // Clear all typing timeouts using captured ref
            timeoutMapRef.forEach(timeout => clearTimeout(timeout));
            timeoutMapRef.clear();
        };
    }, [groupId, user]);

    // Send message to group
    const sendMessage = useCallback((content, type = 'text', options = {}) => {
        const socket = getSocket();
        if (!socket || !groupId) return;

        socket.emit('group.send', {
            groupId,
            content,
            type,
            ...options
        });
    }, [groupId]);

    // Send typing indicator
    const sendTyping = useCallback(() => {
        const socket = getSocket();
        if (!socket || !groupId) return;

        socket.emit('group.typing', { groupId });
    }, [groupId]);

    // Delete a message
    const deleteMessage = useCallback((messageId) => {
        const socket = getSocket();
        if (!socket || !groupId) return;

        socket.emit('group.delete', { groupId, messageId });
    }, [groupId]);

    return {
        messages,
        setMessages,
        typingUsers: Array.from(typingUsers.values()),
        sendMessage,
        sendTyping,
        deleteMessage,
        connectionStatus
    };
};

export default useGroupSocket;
