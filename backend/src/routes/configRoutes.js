import express from 'express';
import { getWebRTCConfig } from '../controllers/configController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Protect WebRTC config endpoint - only authenticated users can access
router.get('/webrtc', authenticateJWT, getWebRTCConfig);

export default router;
