import { useCallback, useEffect } from 'react';
import { getAuthenticatedApi } from '../services/api';

export default function useReadReceipts(conversationId, messages) {
  const markMessagesAsRead = useCallback(async () => {
    if (!conversationId) return;
    try {
      const authenticatedApi = getAuthenticatedApi();
      await authenticatedApi.post('/api/chat/messages/mark-read', { conversationId });
      // No local state change needed; server will reflect via events if required
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [conversationId]);

  useEffect(() => {
    const handleFocus = () => { if (conversationId) markMessagesAsRead(); };
    const handleVisibilityChange = () => { if (!document.hidden && conversationId) markMessagesAsRead(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, markMessagesAsRead]);

  useEffect(() => {
    if (conversationId && !document.hidden && messages.length > 0) {
      const timeoutId = setTimeout(() => { markMessagesAsRead(); }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, conversationId, markMessagesAsRead]);

  return { markMessagesAsRead };
}
