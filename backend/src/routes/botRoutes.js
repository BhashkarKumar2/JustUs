import express from 'express';
import { processBotQuery, getBotStatus, getBotHelp } from '../controllers/botController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Process bot query
router.post('/query', processBotQuery);

// Get bot status
router.get('/status', getBotStatus);

// Get bot help
router.get('/help', getBotHelp);

export default router;
