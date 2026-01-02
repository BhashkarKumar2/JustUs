// Controller to provide WebRTC configuration securely
export const getWebRTCConfig = (req, res) => {
  try {
    // Ensure environment variables are set
    if (!process.env.TURN_USERNAME || !process.env.TURN_CREDENTIAL) {
      console.error('TURN credentials not configured in environment variables');
      return res.status(500).json({ error: 'WebRTC configuration not available' });
    }

    // Only provide ICE servers configuration to authenticated users
    const iceServers = [
      {
        urls: process.env.STUN_URL || "stun:stun.l.google.com:19302"
      },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      },
      {
        urls: process.env.TURN_URL_TCP,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      },
      {
        urls: process.env.TURN_URL_443,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      },
      {
        urls: process.env.TURNS_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      }
    ].filter(server => server.urls); // Remove any undefined URLs

    res.json({
      iceServers,
      iceCandidatePoolSize: 10
    });
  } catch (error) {
    console.error('Error providing WebRTC config:', error);
    res.status(500).json({ error: 'Failed to retrieve WebRTC configuration' });
  }
};
