/**
 * Text-to-Speech Service
 * Handles conversion of text to speech audio using Google Cloud TTS
 */

import textToSpeech from '@google-cloud/text-to-speech';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TTSService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the TTS client
   */
  async initialize() {
    if (this.initialized) return;

    try {
      let clientConfig = {};
      
      // Check if credentials are in environment variable (for production)
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log('Using Google Cloud credentials from environment variable');
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        clientConfig = { credentials };
      } 
      // Otherwise use key file (for local development)
      else {
        const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                        path.join(__dirname, '../../justus-482306-a3598fb1cbe5.json');
        
        if (!fs.existsSync(keyPath)) {
          throw new Error('Google Cloud credentials not found. Set GOOGLE_CLOUD_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS');
        }
        
        console.log('Using Google Cloud credentials from file:', keyPath);
        clientConfig = { keyFilename: keyPath };
      }
      
      this.client = new textToSpeech.TextToSpeechClient(clientConfig);
      
      this.initialized = true;
      console.log('✓ Google Cloud TTS service initialized');
    } catch (error) {
      console.error('Failed to initialize TTS service:', error);
      throw error;
    }
  }

  /**
   * Get voice configuration for a language
   */
  getVoiceConfig(languageCode) {
    const voiceConfigs = {
      'hi': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A', gender: 'FEMALE' },
      'pa': { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A', gender: 'FEMALE' },
      'ta': { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-A', gender: 'FEMALE' },
      'te': { languageCode: 'te-IN', name: 'te-IN-Standard-A', gender: 'FEMALE' },
      'bn': { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A', gender: 'FEMALE' },
      'mr': { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A', gender: 'FEMALE' },
      'gu': { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A', gender: 'FEMALE' },
      'kn': { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A', gender: 'FEMALE' },
      'ml': { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A', gender: 'FEMALE' },
      'ur': { languageCode: 'ur-IN', name: 'ur-IN-Wavenet-A', gender: 'FEMALE' },
      'en': { languageCode: 'en-IN', name: 'en-IN-Neural2-A', gender: 'FEMALE' },
    };

    return voiceConfigs[languageCode] || voiceConfigs['en'];
  }

  /**
   * Generate speech from text
   * @param {string} text - Text to convert to speech
   * @param {string} languageCode - Language code (e.g., 'hi', 'en', 'pa')
   * @param {object} options - Additional options (voice, pitch, speakingRate)
   * @returns {Promise<Buffer>} Audio content as buffer
   */
  async generateSpeech(text, languageCode = 'en', options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for speech generation');
    }

    try {
      const voiceConfig = this.getVoiceConfig(languageCode);
      
      const request = {
        input: { text: text.trim() },
        voice: {
          languageCode: voiceConfig.languageCode,
          name: options.voiceName || voiceConfig.name,
          ssmlGender: voiceConfig.gender
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: options.pitch || 0,
          speakingRate: options.speakingRate || 1.0
        }
      };

      console.log(`[TTS] Generating speech for language: ${languageCode}, voice: ${request.voice.name}`);
      
      const [response] = await this.client.synthesizeSpeech(request);
      
      if (!response.audioContent) {
        throw new Error('No audio content received from TTS service');
      }

      console.log(`[TTS] Generated audio: ${response.audioContent.length} bytes`);
      return response.audioContent;
      
    } catch (error) {
      console.error('[TTS] Error generating speech:', error);
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
  }

  /**
   * Generate speech for multiple texts (batch processing)
   */
  async generateBatchSpeech(texts, languageCode = 'en', options = {}) {
    const results = [];
    
    for (const text of texts) {
      try {
        const audio = await this.generateSpeech(text, languageCode, options);
        results.push({ text, audio, success: true });
      } catch (error) {
        console.error(`[TTS] Failed to generate speech for text: ${text}`, error);
        results.push({ text, error: error.message, success: false });
      }
    }
    
    return results;
  }
}

// Export singleton instance
const ttsService = new TTSService();
export default ttsService;
