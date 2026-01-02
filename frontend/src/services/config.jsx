import api from './api';

// Fetch WebRTC configuration from backend (secure)
export const getWebRTCConfig = async () => {
  try {
    const response = await api.get('/api/config/webrtc');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch WebRTC config:', error);
    // Return fallback configuration if backend is unavailable
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ],
      iceCandidatePoolSize: 10
    };
  }
};
