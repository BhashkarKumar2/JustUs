import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';

class GeminiService {
  constructor() {
    this.genAI = null;
    this.initialized = false;
  }

  // Lazy initialization - only initialize when methods are called
  _initialize() {
    if (this.initialized) {
      return this.genAI !== null;
    }

    this.initialized = true;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  GEMINI_API_KEY not set. AI features will be disabled.');
      this.genAI = null;
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log('✓ Gemini AI Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Gemini AI:', error.message);
      this.genAI = null;
      return false;
    }
  }

  get enabled() {
    return this._initialize();
  }

  /**
   * Smart Search: Semantic search through messages with natural language
   * @param {string} query - Natural language query (e.g., "when did we discuss vacation?")
   * @param {Array} messages - Array of message objects
   * @returns {Promise<Object>} - { results: Array, summary: string }
   */
  async smartSearch(query, messages) {
    if (!this.enabled) {
      throw new Error('Gemini API not configured');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });

      // Validate and filter messages
      const validMessages = messages
        .filter(msg => msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0)
        .slice(-100); // Last 100 valid messages

      if (validMessages.length === 0) {
        return {
          results: [],
          summary: 'No valid text messages found to search.',
          totalFound: 0,
          query
        };
      }

      // Prepare conversation context (limit to avoid token limits)
      const messageContext = validMessages
        .map((msg, idx) => {
          const sender = msg.senderName || msg.senderId || 'Unknown';
          const content = msg.content.substring(0, 500); // Limit message length
          const date = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : 'Unknown date';
          return `[${idx}] ${sender}: ${content} (${date})`;
        })
        .join('\n');

      const prompt = `You are a smart search assistant analyzing a chat conversation.

User Query: "${query}"

Conversation History:
${messageContext}

Task:
1. Identify which messages are relevant to the query
2. Return ONLY the message indices (numbers in brackets) that match, separated by commas
3. After the indices, add "SUMMARY:" followed by a brief summary of findings

Format your response exactly like this:
INDICES: 5,12,45,67
SUMMARY: The conversation about vacation was discussed on March 15th and April 2nd. Plans include going to Hawaii in June.

If no relevant messages found, return:
INDICES: none
SUMMARY: No relevant messages found for this query.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // Parse response
      const indicesMatch = response.match(/INDICES:\s*(.+)/);
      const summaryMatch = response.match(/SUMMARY:\s*(.+)/s);

      const indicesStr = indicesMatch ? indicesMatch[1].trim() : 'none';
      const summary = summaryMatch ? summaryMatch[1].trim() : 'No summary available';

      let results = [];
      if (indicesStr !== 'none') {
        const indices = indicesStr.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i));
        results = indices
          .filter(idx => idx >= 0 && idx < validMessages.length)
          .map(idx => validMessages[idx])
          .filter(msg => msg); // Remove any undefined entries
      }

      return {
        results,
        summary,
        totalFound: results.length,
        query
      };
    } catch (error) {
      console.error('Smart search error:', error);
      throw new Error(`Smart search failed: ${error.message}`);
    }
  }

  /**
   * Enhance transcription: Improve punctuation, grammar, and formatting
   * @param {string} rawTranscript - Raw transcript from speech-to-text
   * @param {string} context - Optional conversation context
   * @returns {Promise<string>} - Enhanced transcript
   */
  async enhanceTranscription(rawTranscript, context = '') {
    if (!this.enabled) {
      return rawTranscript; // Return as-is if AI disabled
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });

      const prompt = `You are an expert transcription editor. Improve the following voice message transcript by:
1. Adding proper punctuation (periods, commas, question marks, etc.)
2. Fixing capitalization
3. Correcting obvious speech-to-text errors
4. Maintaining the original meaning and tone
5. Keeping it natural and conversational

${context ? `Conversation Context: ${context}` : ''}

Raw Transcript:
"${rawTranscript}"

Return ONLY the improved transcript, nothing else. Do not add explanations or quotes.`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Transcription enhancement error:', error);
      return rawTranscript; // Fallback to original
    }
  }

  /**
   * Translate text between languages
   * @param {string} text - Text to translate
   * @param {string} fromLang - Source language code (or 'auto')
   * @param {string} toLang - Target language code
   * @returns {Promise<string>} - Translated text
   */
  async translateText(text, fromLang, toLang) {
    console.log(`[Gemini] Requesting translation: "${text}" (${fromLang} -> ${toLang})`);

    if (!this.enabled) {
      console.log('[Gemini] Service disabled or API key missing');
      return text; // Fallback to original if AI disabled
    }

    // Map language codes to full names for better Gemini understanding
    const langMap = {
      'en': 'English',
      'hi': 'Hindi',
      'pa': 'Punjabi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'bn': 'Bengali',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'ur': 'Urdu',
      'od': 'Odia',
      'as': 'Assamese',
      'auto': 'auto-detect'
    };

    const fromLangName = langMap[fromLang] || fromLang;
    const toLangName = langMap[toLang] || toLang;

    console.log(`[Gemini] Language mapping: ${fromLang} (${fromLangName}) -> ${toLang} (${toLangName})`);

    // Simple script checks to validate translation output language
    const scriptChecks = {
      hi: /[\u0900-\u097F]/, // Devanagari
      pa: /[\u0A00-\u0A7F]/, // Gurmukhi
      ta: /[\u0B80-\u0BFF]/, // Tamil
      te: /[\u0C00-\u0C7F]/, // Telugu
      bn: /[\u0980-\u09FF]/, // Bengali
      mr: /[\u0900-\u097F]/, // Marathi (Devanagari)
      gu: /[\u0A80-\u0AFF]/, // Gujarati
      kn: /[\u0C80-\u0CFF]/, // Kannada
      ml: /[\u0D00-\u0D7F]/, // Malayalam
      ur: /[\u0600-\u06FF]/, // Arabic script (Urdu)
      od: /[\u0B00-\u0B7F]/, // Odia
      as: /[\u0980-\u09FF]/  // Assamese (Bengali script range)
    };

    const looksLikeTargetLanguage = (output) => {
      const rx = scriptChecks[toLang];
      if (!rx) return true; // If unknown, skip strict check
      return rx.test(output);
    };

    const buildPrompt = (strict = false) => `Translate the following text from ${fromLangName === 'auto-detect' ? 'the detected language' : fromLangName} to ${toLangName}.
${strict ? `
STRICT REQUIREMENTS:
- Output MUST be written in native ${toLangName} script${toLang === 'hi' ? ' (Devanagari)' : ''}.
- Do NOT return English unless it is an untranslatable proper noun.
- If the input is already in ${toLangName}, rewrite naturally in ${toLangName}.
` : ''}
Return ONLY the translated text in ${toLangName}, nothing else.
Do not add quotes, explanations, or any other text.
Maintain the tone and meaning of the original text.

Text to translate:
${text}

Translation in ${toLangName}:`;

    try {
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });

      // First attempt (normal prompt)
      let result = await model.generateContent(buildPrompt(false));
      let responseText = result.response.text().trim();

      // If target is not English and output doesn't look like target language script, retry strictly once
      if (toLang !== 'en' && (!looksLikeTargetLanguage(responseText) || responseText === text)) {
        console.warn(`[Gemini] Output not in target script or unchanged. Retrying with strict prompt for ${toLangName}...`);
        result = await model.generateContent(buildPrompt(true));
        responseText = result.response.text().trim();
      }

      console.log(`[Gemini] Translation success (${toLangName}): "${responseText.substring(0, 100)}..."`);
      return responseText;
    } catch (error) {
      console.error('[Gemini] Translation error:', error);
      return text; // Fallback to original
    }
  }

  /**
   * Analyze message tone before sending
   * @param {string} message - Message text
   * @returns {Promise<Object>} - { tone: string, confidence: number, warning: string|null }
   */
  async analyzeTone(message) {
    if (!this.enabled) {
      return { tone: 'neutral', confidence: 0, warning: null };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });

      const prompt = `Analyze the tone of this message. Respond in exactly this format:

TONE: [friendly/neutral/professional/angry/sarcastic/sad/excited]
CONFIDENCE: [0-100]
WARNING: [warning message if tone might be problematic, or "none"]

Message: "${message}"`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      const toneMatch = response.match(/TONE:\s*(\w+)/);
      const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/);
      const warningMatch = response.match(/WARNING:\s*(.+)/);

      return {
        tone: toneMatch ? toneMatch[1] : 'neutral',
        confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 50,
        warning: warningMatch && warningMatch[1] !== 'none' ? warningMatch[1] : null
      };
    } catch (error) {
      console.error('Tone analysis error:', error);
      return { tone: 'neutral', confidence: 0, warning: null };
    }
  }

  /**
   * Transcribe audio file to text
   * @param {Buffer} fileBuffer - Audio file buffer
   * @param {string} mimeType - MIME type of the audio file
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeAudio(fileBuffer, mimeType) {
    if (!this.enabled) {
      throw new Error('Gemini API not configured');
    }

    try {
      console.log(`[Gemini] Transcribing audio (${mimeType}, ${fileBuffer.length} bytes)...`);
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });

      const prompt = `Transcribe the speech in this audio file exactly as spoken. 
      Do not add timestamps, speaker labels, or any other text. 
      If the audio is silent or unintelligible, return an empty string.`;

      // Convert buffer to base64
      const audioBase64 = fileBuffer.toString('base64');

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64
          }
        }
      ]);

      const transcript = result.response.text().trim();
      console.log(`[Gemini] Transcription complete: "${transcript.substring(0, 50)}..."`);
      return transcript;

    } catch (error) {
      console.error('[Gemini] Transcription error:', error);
      // Don't throw, just return empty so flow continues
      return '';
    }
  }
}

export default new GeminiService();
