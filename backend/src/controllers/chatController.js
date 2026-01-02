import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import messageService from '../services/messageService.js';

const DEFAULT_WALLPAPER = {
  sourceType: 'none',
  presetKey: 'aurora',
  imageUrl: '',
  blur: 6,
  opacity: 0.9
};

const clampNumber = (value, min, max, fallback) => {
  const n = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.min(Math.max(n, min), max);
};

export const getMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.query;

    console.log('=== LOADING MESSAGES ===');
    console.log('User ID:', userId);
    console.log('Conversation ID:', conversationId);



    // Enforce pagination limit: default 50, max 100
    // If limit is 0 (or undefined), default to 50 instead of ALL to prevent massive payload
    let limit = parseInt(req.query.limit);
    if (!limit || limit <= 0) limit = 50;
    if (limit > 100) limit = 100; // Cap at 100 for safety
    const beforeStr = req.query.before;

    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.json([]);
      }

      if (userId !== conversation.participantA && userId !== conversation.participantB) {
        return res.json([]);
      }

      let query = {
        conversationId,
        deleted: false
      };

      if (beforeStr) {
        query.timestamp = { $lt: new Date(beforeStr) };
      }

      let messagesQuery = Message.find(query)
        .populate('replyTo', 'senderId type content metadata timestamp')
        .sort({ timestamp: -1 }); // Sort desc for pagination

      if (limit > 0) {
        messagesQuery = messagesQuery.limit(limit);
      }

      let messages = await messagesQuery;

      // Reverse back to chronological order
      messages = messages.reverse();

      const dtos = await messageService.convertToDTOs(messages);
      return res.json(dtos);
    }

    // Fallback for non-conversation specific (user based) - kept simplified but no logs
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    }).sort({ timestamp: 1 });



    const dtos = await messageService.convertToDTOs(messages);
    res.json(dtos);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const userId = req.userId;
    const messageData = req.body;

    messageData.senderId = userId;
    messageData.timestamp = new Date();

    // Ensure conversation exists
    if (!messageData.conversationId && messageData.receiverId) {
      const a = userId;
      const b = messageData.receiverId;
      const key = a <= b ? `${a}:${b}` : `${b}:${a}`;

      // ATOMIC: Prevent race condition with concurrent messages
      const conversation = await Conversation.findOneAndUpdate(
        { key },
        { $setOnInsert: { participantA: a <= b ? a : b, participantB: a <= b ? b : a, key } },
        { upsert: true, new: true }
      );
      messageData.conversationId = conversation._id.toString();
    }

    // Process translation
    const textForTranslation = req.body.plaintext || (!messageData.encryptionNonce ? messageData.content : null);

    if (textForTranslation && messageData.type === 'text') {
      await messageService.processMessageTranslation(messageData, textForTranslation);
    }

    const message = new Message(messageData);
    const saved = await message.save();
    res.json(saved);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { other } = req.query;

    console.log(`Getting/creating conversation between ${userId} and ${other}`);

    // Validate inputs
    if (!userId) {
      console.error('userId is missing from request');
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!other) {
      console.error('other parameter is missing from query');
      return res.status(400).json({ message: 'Other user ID is required' });
    }

    if (userId === other) {
      console.error('Cannot create conversation with self');
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }

    const a = userId;
    const b = other;
    const key = a <= b ? `${a}:${b}` : `${b}:${a}`;

    console.log('Conversation key:', key);

    // ATOMIC: Prevent race condition with concurrent requests
    const conversation = await Conversation.findOneAndUpdate(
      { key },
      { $setOnInsert: { participantA: a <= b ? a : b, participantB: a <= b ? b : a, key } },
      { upsert: true, new: true }
    );
    console.log('Conversation ID:', conversation._id);

    // Transform response to include both _id and id for compatibility
    const response = {
      _id: conversation._id,
      id: conversation._id.toString(),
      participantA: conversation.participantA,
      participantB: conversation.participantB,
      key: conversation.key,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };

    res.json(response);
  } catch (error) {
    console.error('Get/create conversation error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: error.message, error: error.toString() });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    console.log(`Marking messages as read for user ${userId} in conversation ${conversationId}`);

    // Find all unread messages in this conversation where the user is the receiver
    const unreadMessages = await Message.find({
      conversationId,
      receiverId: userId,
      read: false
    });

    if (unreadMessages.length > 0) {
      const readTime = new Date();

      // Mark all as read
      await Message.updateMany(
        {
          conversationId,
          receiverId: userId,
          read: false
        },
        {
          $set: {
            read: true,
            readAt: readTime
          }
        }
      );

      console.log(`Marked ${unreadMessages.length} messages as read`);

      // Note: WebSocket notifications will be sent from the socket handler
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Forward message(s) to another user or conversation
export const forwardMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { messageId, messageIds, targetUserId, targetConversationId } = req.body;

    const ids = messageIds && Array.isArray(messageIds) ? messageIds : (messageId ? [messageId] : []);
    if (!ids.length) {
      return res.status(400).json({ message: 'messageId or messageIds is required' });
    }

    // Resolve target conversation
    let conversationId = targetConversationId;
    let receiverId = targetUserId || null;

    if (!conversationId) {
      if (!receiverId) {
        return res.status(400).json({ message: 'Provide targetUserId or targetConversationId' });
      }
      const a = userId;
      const b = receiverId;
      const key = a <= b ? `${a}:${b}` : `${b}:${a}`;
      // ATOMIC: Prevent race condition
      const conversation = await Conversation.findOneAndUpdate(
        { key },
        { $setOnInsert: { participantA: a <= b ? a : b, participantB: a <= b ? b : a, key } },
        { upsert: true, new: true }
      );
      conversationId = conversation._id.toString();
    }

    // If receiverId not supplied, infer from conversation participants
    if (!receiverId && conversationId) {
      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        return res.status(404).json({ message: 'Target conversation not found' });
      }
      receiverId = conv.participantA === userId ? conv.participantB : conv.participantA;
    }

    const originals = await Message.find({ _id: { $in: ids } });
    if (!originals.length) {
      return res.status(404).json({ message: 'Original message(s) not found' });
    }

    // SECURITY: Verify user has access to all original messages
    for (const orig of originals) {
      if (orig.senderId !== userId && orig.receiverId !== userId) {
        console.error(`[SECURITY] User ${userId} attempted to forward message ${orig._id} they don't have access to`);
        return res.status(403).json({ message: 'Unauthorized: You can only forward your own messages' });
      }
    }

    const forwarded = [];
    for (const orig of originals) {
      const newMsg = new Message({
        senderId: userId,
        receiverId,
        conversationId,
        type: orig.type,
        content: orig.content,
        encryptionNonce: orig.encryptionNonce || null,
        metadata: {
          ...(orig.metadata || {}),
          forwardedFrom: {
            messageId: orig._id.toString(),
            senderId: orig.senderId,
            timestamp: orig.timestamp || orig.createdAt,
          },
        },
        replyTo: null,
        timestamp: new Date(),
        delivered: true,
        deliveredAt: new Date(),
      });

      const saved = await newMsg.save();
      const dto = await messageService.convertToDTO(saved);
      forwarded.push(dto);
    }

    return res.json({ success: true, messages: forwarded });
  } catch (error) {
    console.error('Forward messages error:', error);
    res.status(500).json({ message: 'Failed to forward message' });
  }
};

// Debug endpoints


export const getAllMessages = async (req, res) => {
  console.log('=== DEBUG: GET ALL MESSAGES ===');
  const messages = await Message.find({});
  console.log(`Found ${messages.length} messages`);
  messages.forEach(msg => {
    console.log(`Message ID: ${msg._id}, Content: ${msg.content}, Sender: ${msg.senderId}, Receiver: ${msg.receiverId}`);
  });
  res.json(messages);
};

export const getAllConversations = async (req, res) => {
  console.log('=== DEBUG: GET ALL CONVERSATIONS ===');
  const conversations = await Conversation.find({});
  console.log(`Found ${conversations.length} conversations`);
  conversations.forEach(conv => {
    console.log(`Conversation ID: ${conv._id}, Key: ${conv.key}, Participants: ${conv.participantA} <-> ${conv.participantB}`);
  });
  res.json(conversations);
};

export const getWallpaper = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.participantA !== userId && conversation.participantB !== userId) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    const stored = conversation.wallpapers?.get?.(userId) || conversation.wallpapers?.[userId];
    const response = { ...DEFAULT_WALLPAPER, ...(stored ? stored.toObject?.() || stored : {}) };

    return res.json(response);
  } catch (error) {
    console.error('Get wallpaper error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const setWallpaper = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId, sourceType, presetKey, imageUrl, blur, opacity } = req.body;

    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.participantA !== userId && conversation.participantB !== userId) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    const nextSettings = {
      sourceType: ['preset', 'custom', 'none'].includes(sourceType) ? sourceType : DEFAULT_WALLPAPER.sourceType,
      presetKey: presetKey || DEFAULT_WALLPAPER.presetKey,
      imageUrl: imageUrl || '',
      blur: clampNumber(blur, 0, 48, DEFAULT_WALLPAPER.blur),
      opacity: clampNumber(opacity, 0, 1, DEFAULT_WALLPAPER.opacity)
    };

    if (nextSettings.sourceType === 'none') {
      nextSettings.imageUrl = '';
      nextSettings.presetKey = 'none';
    }

    if (!conversation.wallpapers) {
      conversation.wallpapers = new Map();
    }

    // For Map compatibility whether mongoose stored as Map or plain object
    if (typeof conversation.wallpapers.set === 'function') {
      conversation.wallpapers.set(userId, nextSettings);
    } else {
      conversation.wallpapers[userId] = nextSettings;
    }

    await conversation.save();

    return res.json(nextSettings);
  } catch (error) {
    console.error('Set wallpaper error:', error);
    return res.status(500).json({ message: error.message });
  }
};
