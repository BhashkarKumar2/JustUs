import api from './api';
export const fetchMessages = () => api.get('/api/chat/messages');
export const sendMessage = (m) => api.post('/api/chat/messages', m);
export const forwardMessage = (payload) => api.post('/api/chat/messages/forward', payload);
