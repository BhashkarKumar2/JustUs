import geminiService from '../services/geminiService.js';
import translationService from '../services/translationService.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

// Translate text to a target language (default English)
export const translateText = async (req, res) => {
  try {
    const { text, from = 'auto', to = 'en' } = req.body;

    console.log('[Backend] translateText request:', { textLength: text?.length, from, to });

    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const translated = await translationService.translate(text, from, to);
    console.log('[Backend] translateText response:', { translated });

    res.json({ translated, from, to });
  } catch (error) {
    console.error('[Backend] Translation error:', error);
    res.status(500).json({
      message: 'Translation failed',
      error: error.message,
      translated: req.body.text
    });
  }
};

export const smartSearch = async (req, res) => {
  try {
    const userId = req.userId;
    const { query, conversationId } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }

    console.log(`Smart search: "${query}" for user ${userId}`);

    // Get messages for this user - only text messages with content
    let messageQuery = {
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ],
      deleted: false,
      type: 'text', // Only search text messages
      content: { $exists: true, $ne: '' } // Must have content
    };

    if (conversationId) {
      messageQuery.conversationId = conversationId;
    }

    const messages = await Message.find(messageQuery)
      .sort({ timestamp: 1 })
      .limit(500); // Limit for performance

    if (messages.length === 0) {
      return res.json({
        results: [],
        summary: 'No text messages found to search in this conversation.',
        totalFound: 0,
        query
      });
    }

    // Get user names for context
    const userIds = [...new Set(messages.map(m => m.senderId))];
    const users = await User.find({ _id: { $in: userIds } });
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u.displayName || u.username;
    });

    // Add sender names to messages and ensure content exists
    const enrichedMessages = messages
      .filter(msg => msg.content && typeof msg.content === 'string')
      .map(msg => ({
        ...msg.toObject(),
        senderName: userMap[msg.senderId] || 'Unknown'
      }));

    // Perform smart search
    const searchResult = await geminiService.smartSearch(query, enrichedMessages);

    res.json(searchResult);
  } catch (error) {
    console.error('========== SMART SEARCH ERROR ==========');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    console.error('========================================');
    
    res.status(500).json({ 
      message: 'Smart search failed', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const enhanceTranscription = async (req, res) => {
  try {
    const { transcript, context } = req.body;

    if (!transcript) {
      return res.status(400).json({ message: 'Transcript is required' });
    }

    console.log('Enhancing transcription:', transcript.substring(0, 50) + '...');

    const enhanced = await geminiService.enhanceTranscription(transcript, context);

    res.json({
      original: transcript,
      enhanced,
      improved: enhanced !== transcript
    });
  } catch (error) {
    console.error('Transcription enhancement error:', error);
    res.status(500).json({ 
      message: 'Transcription enhancement failed',
      error: error.message,
      fallback: req.body.transcript // Return original on error
    });
  }
};

export const analyzeTone = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const analysis = await geminiService.analyzeTone(message);
    res.json(analysis);
  } catch (error) {
    console.error('Tone analysis error:', error);
    res.status(500).json({ 
      message: 'Tone analysis failed',
      error: error.message 
    });
  }
};
