import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { smartSearch, enhanceTranscription, analyzeTone, translateText } from '../controllers/aiController.js';
import translationService from '../services/translationService.js';

const router = express.Router();

// All AI routes require authentication
router.use(authenticateJWT);

// Smart search endpoint
router.post('/search', smartSearch);

// Transcription enhancement endpoint
router.post('/transcribe/enhance', enhanceTranscription);

// Tone analysis endpoint
router.post('/analyze-tone', analyzeTone);

// Translation endpoint
router.post('/translate', translateText);

// Translation cache stats endpoint
router.get('/translation/stats', (req, res) => {
  const stats = translationService.getCacheStats();
  res.json(stats);
});

export default router;
