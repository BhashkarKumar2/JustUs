import { useState, useEffect, useCallback } from 'react';
import * as groupService from '../services/groupService';

/**
 * Hook for managing group messages
 */
export const useGroupMessages = (groupId) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(null);

    // Load initial messages
    useEffect(() => {
        if (!groupId) return;

        const loadMessages = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await groupService.getGroupMessages(groupId, 50);
                setMessages(response.messages || []);
                setHasMore(response.hasMore || false);
            } catch (err) {
                console.error('Failed to load group messages:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadMessages();
    }, [groupId]);

    // Load more messages (pagination)
    const loadMore = useCallback(async () => {
        if (!groupId || loading || !hasMore || messages.length === 0) return;

        const oldestMessage = messages[0];
        setLoading(true);
        try {
            const response = await groupService.getGroupMessages(
                groupId,
                50,
                oldestMessage.timestamp
            );
            setMessages(prev => [...(response.messages || []), ...prev]);
            setHasMore(response.hasMore || false);
        } catch (err) {
            console.error('Failed to load more messages:', err);
        } finally {
            setLoading(false);
        }
    }, [groupId, loading, hasMore, messages]);

    // Add a new message (from socket)
    const addMessage = useCallback((message) => {
        setMessages(prev => {
            if (prev.some(m => m.id === message.id)) return prev;
            return [...prev, message];
        });
    }, []);

    // Update a message
    const updateMessage = useCallback((messageId, updates) => {
        setMessages(prev =>
            prev.map(m => m.id === messageId ? { ...m, ...updates } : m)
        );
    }, []);

    // Delete a message
    const markDeleted = useCallback((messageId) => {
        setMessages(prev =>
            prev.map(m => m.id === messageId ? { ...m, deleted: true } : m)
        );
    }, []);

    return {
        messages,
        setMessages,
        loading,
        hasMore,
        error,
        loadMore,
        addMessage,
        updateMessage,
        markDeleted
    };
};

export default useGroupMessages;
