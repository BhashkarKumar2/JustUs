import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Bot Service - AI Assistant for in-conversation help
 * Activated with "@#" prefix (similar to WhatsApp's @MetaAI)
 */
class BotService {
  constructor() {
    this.genAI = null;
    this.initialized = false;
    this.systemPrompt = `You are a helpful AI assistant integrated into a chat application called JustUs. 
Your role is to help users with:
- Answering questions and providing information
- Searching the web for current information
- Helping with calculations and conversions
- Providing recommendations and suggestions
- General assistance with any query

Keep responses concise, friendly, and helpful. 
If you don't know something, admit it honestly.
Always maintain a professional yet conversational tone.`;
  }

  _initialize() {
    if (this.initialized) {
      return this.genAI !== null;
    }

    this.initialized = true;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️  GEMINI_API_KEY not set. Bot features will be disabled.');
      console.warn('⚠️  Please add GEMINI_API_KEY to your .env file');
      this.genAI = null;
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log('✓ Bot Service initialized');
      console.log('✓ Using Gemini API key:', apiKey.substring(0, 10) + '...');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Bot Service:', error.message);
      this.genAI = null;
      return false;
    }
  }

  get enabled() {
    return this._initialize();
  }

  /**
   * Check if a message is a bot command (starts with @#)
   * @param {string} text - Message text
   * @returns {boolean}
   */
  isBotCommand(text) {
    return typeof text === 'string' && text.trim().startsWith('@#');
  }

  /**
   * Extract the actual query from bot command
   * @param {string} text - Message text with @# prefix
   * @returns {string} - Query without the @# prefix
   */
  extractQuery(text) {
    if (!this.isBotCommand(text)) {
      return text;
    }
    return text.trim().substring(2).trim();
  }

  /**
   * Process bot query and generate response
   * @param {string} query - User query (without @# prefix)
   * @param {Object} context - Additional context (conversation history, user info, etc.)
   * @returns {Promise<Object>} - { success: boolean, response: string, error?: string }
   */
  async processQuery(query, context = {}) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Bot service is currently unavailable. Please try again later.',
        response: 'Sorry, I\'m currently unavailable. The AI service is not configured.'
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: 'Empty query',
        response: 'Hi! I\'m here to help. What would you like to know?'
      };
    }

    try {
      const modelName = process.env.GEMINI_MODEL || 'models/gemini-2.0-flash';
      const model = this.genAI.getGenerativeModel({ model: modelName });

      // Build the prompt with context
      let fullPrompt = this.systemPrompt + '\n\n';
      
      // Add conversation context if provided
      if (context.recentMessages && context.recentMessages.length > 0) {
        fullPrompt += 'Recent conversation context:\n';
        context.recentMessages.slice(-5).forEach(msg => {
          fullPrompt += `${msg.sender}: ${msg.text}\n`;
        });
        fullPrompt += '\n';
      }

      fullPrompt += `User query: ${query}`;

      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      return {
        success: true,
        response: text,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Bot Service Error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        response: error.response
      });
      
      // Handle specific error cases
      if (error.message?.includes('API key')) {
        return {
          success: false,
          error: error.message,
          response: 'Sorry, there\'s an issue with my configuration. Please contact support.'
        };
      }

      if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        return {
          success: false,
          error: error.message,
          response: 'Sorry, I\'ve reached my usage limit for now. Please try again later.'
        };
      }

      if (error.message?.includes('SAFETY') || error.message?.includes('blocked')) {
        return {
          success: false,
          error: error.message,
          response: 'Sorry, I cannot process that request due to safety guidelines.'
        };
      }

      return {
        success: false,
        error: error.message,
        response: `Sorry, I encountered an error: ${error.message}. Please try again.`
      };
    }
  }

  /**
   * Get help text for bot commands
   * @returns {string}
   */
  getHelpText() {
    return `🤖 **Bot Assistant Help**

To activate me, simply type **@#** followed by your question or request.

**Examples:**
• @# What's the weather like today?
• @# Help me with math: what's 15% of 200?
• @# Recommend a good movie
• @# Explain what is blockchain
• @# Translate "hello" to Spanish

I can help you with:
✓ Answering questions
✓ Web searches
✓ Calculations
✓ Recommendations
✓ Explanations
✓ And much more!

Just ask me anything! 😊`;
  }

  /**
   * Handle special commands (like /help, /about, etc.)
   * @param {string} query - User query
   * @returns {Object|null} - Response object if it's a special command, null otherwise
   */
  handleSpecialCommands(query) {
    const normalizedQuery = query.toLowerCase().trim();

    if (normalizedQuery === 'help' || normalizedQuery === '/help') {
      return {
        success: true,
        response: this.getHelpText(),
        isSpecialCommand: true
      };
    }

    if (normalizedQuery === 'about' || normalizedQuery === '/about') {
      return {
        success: true,
        response: '🤖 I\'m an AI assistant powered by Google\'s Gemini, integrated into JustUs to help you with information, answers, and assistance right within your conversations!',
        isSpecialCommand: true
      };
    }

    return null;
  }

  /**
   * Main entry point for bot interactions
   * @param {string} messageText - Full message text (including @#)
   * @param {Object} context - Context object
   * @returns {Promise<Object>}
   */
  async handleBotMessage(messageText, context = {}) {
    if (!this.isBotCommand(messageText)) {
      return {
        success: false,
        error: 'Not a bot command',
        response: null
      };
    }

    const query = this.extractQuery(messageText);
    
    // Check for special commands first
    const specialResponse = this.handleSpecialCommands(query);
    if (specialResponse) {
      return specialResponse;
    }

    // Process regular query
    return await this.processQuery(query, context);
  }
}

// Export singleton instance
export default new BotService();
