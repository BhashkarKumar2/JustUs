
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';

class TranscriptionService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.provider = 'none';
  }

  _initialize() {
    if (this.initialized) return true;

    // Prioritize Groq (Fastest/Free Tier)
    if (process.env.GROQ_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
      });
      this.model = 'whisper-large-v3';
      this.provider = 'Groq';
      this.initialized = true;
      console.log('✓ Transcription Service initialized with Groq (Whisper-v3)');
      return true;
    }

    // Fallback to OpenAI (Paid but Reliable)
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.model = 'whisper-1';
      this.provider = 'OpenAI';
      this.initialized = true;
      console.log('✓ Transcription Service initialized with OpenAI');
      return true;
    }

    console.warn('⚠️  GROQ_API_KEY not set. Transcription service disabled.');
    return false;
  }

  /**
   * Transcribe audio buffer
   * @param {Buffer} fileBuffer - The raw audio bits
   * @param {string} mimeType - e.g. 'audio/webm'
   */
  async transcribe(fileBuffer, mimeType) {
    if (!this._initialize()) {
      console.log('[Transcription] Skipped: No API Key configured.');
      return null;
    }

    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.webm`);

    try {
      // OpenAI SDK requires a file path or ReadStream, not a Buffer
      fs.writeFileSync(tempFilePath, fileBuffer);

      console.log(`[Transcription] Sending ${fileBuffer.length} bytes to ${this.provider} (${this.model})...`);

      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: this.model,
        response_format: 'text',
        language: 'en' // auto-detect is default but explicit EN helps with mixing. 
        // Actually remove 'en' to allow source lang detection if it supports it.
        // Groq/Whisper supports auto-detect.
      });

      // Handle raw string or object response depending on SDK version/params
      const text = typeof transcription === 'string' ? transcription : transcription.text;

      console.log(`[Transcription] Success: "${text.substring(0, 50)}..."`);
      return text;

    } catch (error) {
      console.error(`[Transcription] ${this.provider} Error:`, error.message);

      if (error.status === 429) {
        console.error('⚠️ Rate Limit Exceeded. Consider upgrading plan or rotating keys.');
      }

      return null;
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }
}

export default new TranscriptionService();
