// Controller to provide WebRTC configuration securely
import turnService from '../services/turnService.js';

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';

/**
 * Static coturn-style credentials from environment variables.
 * Kept as a fallback so a self-hosted TURN server can be used without a code
 * change. Returns an empty array when not configured.
 */
const getStaticTurnServers = () => {
  const { TURN_USERNAME, TURN_CREDENTIAL } = process.env;

  if (!TURN_USERNAME || !TURN_CREDENTIAL) return [];

  return [
    process.env.TURN_URL,
    process.env.TURN_URL_TCP,
    process.env.TURN_URL_443,
    process.env.TURNS_URL
  ]
    .filter(Boolean)
    .map(urls => ({ urls, username: TURN_USERNAME, credential: TURN_CREDENTIAL }));
};

/**
 * GET /api/config/webrtc
 *
 * Resolves ICE servers in priority order:
 *   1. Cloudflare Realtime TURN (ephemeral credentials)
 *   2. Static coturn credentials from env vars
 *   3. STUN only
 *
 * Always responds 200. A missing TURN tier degrades call quality on
 * restrictive networks but must not break calling outright, so the client
 * always receives a usable configuration.
 */
export const getWebRTCConfig = async (req, res) => {
  const stunServer = { urls: process.env.STUN_URL || DEFAULT_STUN_URL };

  try {
    let turnServers = await turnService.getIceServers();
    let turnSource = 'cloudflare';

    if (!turnServers || turnServers.length === 0) {
      turnServers = getStaticTurnServers();
      turnSource = turnServers.length > 0 ? 'static' : 'none';
    }

    if (turnSource === 'none') {
      console.warn(
        '[config] No TURN provider configured - calls will fail on restrictive networks'
      );
    }

    // Cloudflare's response already bundles its own STUN entry; keeping the
    // configured STUN server first costs nothing and preserves a public
    // reflexive candidate source if the TURN tier is unavailable.
    res.json({
      iceServers: [stunServer, ...turnServers],
      iceCandidatePoolSize: 10,
      turnSource
    });
  } catch (error) {
    console.error('Error providing WebRTC config:', error);

    // Last-resort degradation: STUN only, still a valid configuration.
    res.json({
      iceServers: [stunServer],
      iceCandidatePoolSize: 10,
      turnSource: 'none'
    });
  }
};
