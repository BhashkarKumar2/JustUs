import User from '../models/User.js';
import geminiService from './geminiService.js';
import translationService from './translationService.js';

// Constants to avoid magic strings
export const BOT_SENDER_ID = 'bot';
export const BOT_DISPLAY_NAME = 'Bot Assistant';

export class MessageService {
  async convertToDTO(message) {
    const dto = {
      id: message._id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      conversationId: message.conversationId,
      type: message.type,
      content: message.content,
      encryptionNonce: message.encryptionNonce,
      metadata: message.metadata,
      replyTo: message.replyTo,
      timestamp: message.timestamp,
      edited: message.edited,
      editedAt: message.editedAt,
      deleted: message.deleted,
      delivered: message.delivered,
      deliveredAt: message.deliveredAt,
      read: message.read,
      readAt: message.readAt,
      isBot: message.isBot || false,
      isBotQuery: message.isBotQuery || false,
      // Translation fields
      originalLanguage: message.originalLanguage,
      translatedText: message.translatedText,
      translatedLanguage: message.translatedLanguage,
      showOriginal: message.showOriginal
    };

    // If message exists in database but doesn't have delivered flag set,
    // consider it delivered (for backward compatibility)
    if (message._id && !dto.delivered) {
      dto.delivered = true;
      dto.deliveredAt = message.timestamp || new Date();
    }

    // Fetch sender information (skip for bot messages)
    if (message.senderId && message.senderId !== BOT_SENDER_ID) {
      const sender = await User.findById(message.senderId);
      if (sender) {
        dto.senderUsername = sender.username;
        dto.senderDisplayName = sender.displayName;
      }
    } else if (message.senderId === BOT_SENDER_ID) {
      // Set bot display information
      dto.senderUsername = BOT_SENDER_ID;
      dto.senderDisplayName = BOT_DISPLAY_NAME;
    }

    return dto;
  }

  async convertToDTOs(messages) {
    // Get all unique sender IDs (exclude bot)
    const senderIds = [...new Set(messages.map(msg => msg.senderId).filter(id => id !== BOT_SENDER_ID))];

    // Fetch all users in batch for efficiency
    const users = await User.find({ _id: { $in: senderIds } });
    const userMap = new Map(users.map(user => [user._id.toString(), user]));

    // Convert messages to DTOs
    return messages.map(message => {
      const dto = {
        id: message._id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        conversationId: message.conversationId,
        type: message.type,
        content: message.content,
        encryptionNonce: message.encryptionNonce,
        metadata: message.metadata,
        replyTo: message.replyTo,
        timestamp: message.timestamp,
        edited: message.edited,
        editedAt: message.editedAt,
        deleted: message.deleted,
        delivered: message.delivered,
        deliveredAt: message.deliveredAt,
        read: message.read,
        readAt: message.readAt,
        isBot: message.isBot || false,
        isBotQuery: message.isBotQuery || false,
        // Translation fields
        originalLanguage: message.originalLanguage,
        translatedText: message.translatedText,
        translatedLanguage: message.translatedLanguage,
        showOriginal: message.showOriginal
      };

      // If message exists in database but doesn't have delivered flag set,
      // consider it delivered (for backward compatibility)
      if (message._id && !dto.delivered) {
        dto.delivered = true;
        dto.deliveredAt = message.timestamp || new Date();
      }

      // Handle bot messages specially
      if (message.senderId === BOT_SENDER_ID) {
        dto.senderUsername = BOT_SENDER_ID;
        dto.senderDisplayName = BOT_DISPLAY_NAME;
      } else {
        const sender = userMap.get(message.senderId);
        if (sender) {
          dto.senderUsername = sender.username;
          dto.senderDisplayName = sender.displayName;
        }
      }

      return dto;
    });
  }

  async processMessageTranslation(messageData, textOverride = null) {
    try {
      const contentToTranslate = textOverride || messageData.content;

      console.log('[Translation] Processing message:', {
        contentLength: contentToTranslate?.length,
        type: messageData.type,
        senderId: messageData.senderId,
        receiverId: messageData.receiverId,
        hasOverride: !!textOverride
      });

      // Skip if no content or not text
      if (!contentToTranslate || messageData.type !== 'text') {
        console.log('[Translation] Skipped: Not text or empty content');
        return messageData;
      }

      // Get sender and receiver
      const sender = await User.findById(messageData.senderId);
      const receiver = await User.findById(messageData.receiverId);

      if (!sender || !receiver) {
        console.log('[Translation] Skipped: Sender or receiver not found');
        return messageData;
      }

      const senderLang = sender.preferredLanguage || 'en';
      const receiverLang = receiver.preferredLanguage || 'en';

      console.log(`[Translation] Languages: Sender=${senderLang}, Receiver=${receiverLang}`);

      // If languages differ, translate
      if (senderLang !== receiverLang) {
        console.log(`[Translation] Translating message from ${senderLang} to ${receiverLang}...`);

        const translatedText = await translationService.translate(
          contentToTranslate,
          senderLang,
          receiverLang
        );

        console.log('[Translation] Result:', translatedText);

        messageData.originalLanguage = senderLang;
        messageData.translatedText = translatedText;
        messageData.translatedLanguage = receiverLang;
        messageData.showOriginal = false; // Default to showing translation
      } else {
        console.log('[Translation] Skipped: Languages match');
      }

      return messageData;
    } catch (error) {
      console.error('[Translation] Error:', error);
      return messageData;
    }
  }
}

export default new MessageService();
