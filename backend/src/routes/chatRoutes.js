import express from 'express';
import {
  getMessages,
  sendMessage,
  getOrCreateConversation,
  markMessagesAsRead,
  forwardMessages,
  getWallpaper,
  setWallpaper
} from '../controllers/chatController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Protected routes
router.get('/messages', authenticateJWT, getMessages);
router.post('/messages', authenticateJWT, sendMessage);
router.post('/conversation', authenticateJWT, getOrCreateConversation);
router.post('/messages/mark-read', authenticateJWT, markMessagesAsRead);
router.post('/messages/forward', authenticateJWT, forwardMessages);
router.get('/wallpaper', authenticateJWT, getWallpaper);
router.post('/wallpaper', authenticateJWT, setWallpaper);

// DEBUG ROUTES REMOVED FOR SECURITY
// These were exposing all messages without authentication
// If needed for development, add authenticateJWT + isAdmin middleware

export default router;
