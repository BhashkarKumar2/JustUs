/**
 * Text-to-Speech Routes
 * Endpoints for converting text to speech
 */

import express from 'express';
import ttsService from '../services/ttsService.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/tts/generate
 * Generate speech audio from text
 */
router.post('/generate', authenticateJWT, async (req, res) => {
  try {
    const { text, language } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const languageCode = language || 'en';

    console.log(`[TTS API] Generating speech for language: ${languageCode}`);

    const audioContent = await ttsService.generateSpeech(text, languageCode);

    // Set appropriate headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length,
      'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
    });

    res.send(audioContent);

  } catch (error) {
    console.error('[TTS API] Error:', error);
    res.status(500).json({ error: 'Text-to-speech generation failed' });
  }
});

export default router;
