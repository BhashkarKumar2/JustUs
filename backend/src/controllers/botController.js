import botService from '../services/botService.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

/**
 * Bot Controller - Handle bot-related API requests
 */

/**
 * Process a bot query
 * POST /api/bot/query
 */
export const processBotQuery = async (req, res) => {
  try {
    const { query, conversationId, context } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }

    // Get recent conversation context if conversationId is provided
    let conversationContext = context || {};
    if (conversationId) {
      const recentMessages = await Message.find({ conversationId })
        .sort({ timestamp: -1 })
        .limit(10)
        .select('sender text timestamp');
      
      conversationContext.recentMessages = recentMessages.reverse();
    }

    // Process the query through bot service
    const result = await botService.handleBotMessage(query, conversationContext);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to process query',
        response: result.response
      });
    }

    res.json({
      success: true,
      response: result.response,
      timestamp: result.timestamp || new Date()
    });

  } catch (error) {
    console.error('Bot query error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Check if bot service is available
 * GET /api/bot/status
 */
export const getBotStatus = async (req, res) => {
  try {
    const enabled = botService.enabled;
    
    res.json({
      success: true,
      enabled,
      message: enabled 
        ? 'Bot service is available' 
        : 'Bot service is currently unavailable'
    });
  } catch (error) {
    console.error('Bot status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check bot status',
      error: error.message
    });
  }
};

/**
 * Get bot help information
 * GET /api/bot/help
 */
export const getBotHelp = async (req, res) => {
  try {
    const helpText = botService.getHelpText();
    
    res.json({
      success: true,
      help: helpText
    });
  } catch (error) {
    console.error('Bot help error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get help information',
      error: error.message
    });
  }
};

/**
 * Save bot message to conversation
 * This is called internally after bot responds
 */
export const saveBotMessage = async (conversationId, query, response, userId) => {
  try {
    // Save user's query to bot
    const userMessage = new Message({
      conversationId,
      sender: userId,
      text: query,
      type: 'text',
      isBot: false,
      isBotQuery: true, // Mark as a query to bot
      timestamp: new Date()
    });
    await userMessage.save();

    // Save bot's response
    const botMessage = new Message({
      conversationId,
      sender: 'bot', // Special sender ID for bot
      text: response,
      type: 'text',
      isBot: true, // Mark as bot message
      timestamp: new Date()
    });
    await botMessage.save();

    // Update conversation's last message
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: response,
      updatedAt: new Date()
    });

    return {
      userMessage,
      botMessage
    };
  } catch (error) {
    console.error('Error saving bot message:', error);
    throw error;
  }
};
