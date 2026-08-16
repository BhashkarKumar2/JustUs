import api from './api';

// Fetch WebRTC configuration from backend (secure)
export const getWebRTCConfig = async () => {
  try {
    const response = await api.get('/api/config/webrtc');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch WebRTC config:', error);
    // Return fallback configuration if backend is unavailable.
    // STUN-only still connects most peers; calls on restrictive networks
    // (mobile data, corporate NAT) will fail without TURN.
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ],
      iceCandidatePoolSize: 10,
      turnSource: 'unreachable'
    };
  }
};
