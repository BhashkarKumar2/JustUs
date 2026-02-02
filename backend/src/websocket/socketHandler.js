import { verifyToken } from '../utils/jwtUtil.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Group from '../models/Group.js';
import messageService from '../services/messageService.js';
import CryptoService from '../services/cryptoService.js';
import User from '../models/User.js';
import botService from '../services/botService.js';
import geminiService from '../services/geminiService.js';
import groupAIService from '../services/groupAIService.js';
import transcriptionService from '../services/transcriptionService.js';
import rateLimiter from '../middleware/socketRateLimiter.js';
import mongoose from 'mongoose';

export const configureSocketIO = (io) => {
  // console.log('=== CONFIGURING SOCKET.IO AUTH MIDDLEWARE ===');
  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    try {
      // Try to get token from handshake auth
      let token = socket.handshake.auth.token;

      // If not in auth, try query params
      if (!token) {
        token = socket.handshake.query.token;
      }

      // If not in query, try headers
      if (!token) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        return next(new Error('Authentication required: No token'));
      }

      // Debug log
      // console.log('Verifying socket token:', token.substring(0, 20) + '...');

      const decoded = verifyToken(token);
      if (!decoded) {
        console.log('WebSocket connection rejected: Verify failed for token');
        return next(new Error('Authentication error: Invalid token'));
      }

      socket.userId = decoded.userId;
      socket.username = decoded.username;
      console.log(`WebSocket authenticated for user: ${socket.userId}`);
      next();
    } catch (error) {
      console.log('WebSocket authentication exception:', error);
      next(new Error('Authentication error: ' + error.message));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Broadcast user online status to all connected users
    socket.broadcast.emit('user:status', {
      userId: socket.userId,
      username: socket.username,
      status: 'online'
    });

    // Handle key exchange for E2EE
    socket.on('crypto.exchange-key', async (data) => {
      try {
        const { receiverId, publicKey } = data;
        const userId = socket.userId;

        console.log(`Key exchange: ${userId} -> ${receiverId}`);

        // Store/update user's public key
        await User.updateOne(
          { _id: userId },
          { publicKey },
          { upsert: false }
        );

        // Send requester's public key to the other user
        io.to(`user:${receiverId}`).emit('crypto.key-offer', {
          userId,
          username: socket.username,
          publicKey
        });

        socket.emit('crypto.key-sent');
      } catch (error) {
        console.error('Error handling crypto.exchange-key:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle chat.send with encryption support
    socket.on('chat.send', async (incoming) => {
      // console.log('>>> [DEBUG] chat.send received');
      try {
        const userId = socket.userId;

        // Rate limiting check
        const rateCheck = rateLimiter.checkLimit(userId);
        if (!rateCheck.allowed) {
          console.log(`[RateLimit] User ${userId} exceeded limit`);
          socket.emit('error:rate_limit', {
            message: 'Too many messages. Please slow down.',
            retryAfter: rateCheck.retryAfter,
            limit: rateCheck.limit
          });
          return;
        }

        const messageData = {
          senderId: userId,
          receiverId: incoming.receiverId,
          type: incoming.type,
          content: incoming.ciphertext || incoming.content,
          encryptionNonce: incoming.nonce || null,
          metadata: incoming.metadata || null,
          replyTo: incoming.replyTo || null,
          timestamp: new Date(),
          delivered: true,
          deliveredAt: new Date()
        };

        // Attach or create conversation
        if (incoming.conversationId) {
          console.log('Client provided conversation ID:', incoming.conversationId);

          // Verify ID validity
          if (!mongoose.Types.ObjectId.isValid(incoming.conversationId)) {
            console.error('Invalid conversation ID format');
            socket.emit('error', { message: 'Invalid conversation ID' });
            return;
          }

          const providedConversation = await Conversation.findById(incoming.conversationId);

          if (!providedConversation) {
            console.error(`[SECURITY] Non-existent conversation ID provided: ${incoming.conversationId}`);
            socket.emit('error', { message: 'Invalid conversation' });
            return;
          }

          // Verify participation
          const isParticipant = (
            providedConversation.participantA === userId ||
            providedConversation.participantA?.toString() === userId ||
            providedConversation.participantB === userId ||
            providedConversation.participantB?.toString() === userId
          );

          if (!isParticipant) {
            console.error(`[SECURITY] ATTACK BLOCKED: User ${userId} attempted to inject message into unauthorized conversation`);
            socket.emit('error', { message: 'Unauthorized conversation access' });
            return;
          }

          messageData.conversationId = incoming.conversationId;

        } else if (incoming.receiverId) {
          console.log('Deriving conversation from receiverId');
          const a = userId;
          const b = incoming.receiverId;
          const key = a <= b ? `${a}:${b}` : `${b}:${a}`;

          // ATOMIC: Use findOneAndUpdate with upsert to prevent race condition
          // when two users message each other simultaneously
          const conversation = await Conversation.findOneAndUpdate(
            { key },
            {
              $setOnInsert: {
                participantA: a <= b ? a : b,
                participantB: a <= b ? b : a,
                key
              }
            },
            { upsert: true, new: true }
          );

          messageData.conversationId = conversation._id.toString();
        } else {
          console.error('Missing both conversationId and receiverId');
          socket.emit('error', { message: 'Missing recipient' });
          return;
        }

        // Translation logic setup
        const textForTranslation = incoming.plaintext || (!incoming.ciphertext ? incoming.content : null);

        // console.log('Attempting to save message to DB...');
        const message = new Message(messageData);
        let saved;
        try {
          saved = await message.save();
          // console.log('>>> [SUCCESS] Message saved to DB with ID:', saved._id);
        } catch (dbError) {
          console.error('!!! [FATAL] DB Save Failed:', dbError);
          socket.emit('error', { message: 'Database save failed' });
          return;
        }

        // Broadcast immediately
        const messageDTO = await messageService.convertToDTO(saved);
        // console.log('Broadcasting DTO to sender/receiver...');

        io.to(`user:${userId}`).emit('message', messageDTO);
        io.to(`user:${incoming.receiverId}`).emit('message', messageDTO);

        // Async Translation
        if (textForTranslation && incoming.type === 'text') {
          (async () => {
            try {
              console.log('[Backend] Starting async translation...');
              const translationResult = await messageService.processMessageTranslation({ ...messageData }, textForTranslation);

              if (translationResult.translatedText) {
                const updatedMsg = await Message.findByIdAndUpdate(
                  saved._id,
                  {
                    translatedText: translationResult.translatedText,
                    translatedLanguage: translationResult.translatedLanguage,
                    originalLanguage: translationResult.originalLanguage,
                    showOriginal: true
                  },
                  { new: true }
                );
                const updatedDTO = await messageService.convertToDTO(updatedMsg);

                // Only emit if users are still connected (graceful handling)
                if (io.sockets.adapter.rooms.has(`user:${userId}`)) {
                  io.to(`user:${userId}`).emit('message.updated', updatedDTO);
                }
                if (io.sockets.adapter.rooms.has(`user:${incoming.receiverId}`)) {
                  io.to(`user:${incoming.receiverId}`).emit('message.updated', updatedDTO);
                }
              }
            } catch (err) {
              console.error('Async translation failed:', err);
            }
          })();
        }

        // Async Audio Processing
        if (incoming.type === 'audio' && incoming.content) {
          (async () => {
            try {
              console.log('[Backend] Starting async audio processing...');
              const urlParts = incoming.content.split('/');
              const fileId = urlParts[urlParts.length - 1].split('?')[0];

              if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
                console.error('[Backend] Invalid file ID for audio processing:', fileId);
                return;
              }

              const db = mongoose.connection.db;
              const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'fs' });

              const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
              const chunks = [];

              downloadStream.on('data', (chunk) => chunks.push(chunk));
              downloadStream.on('end', async () => {
                try {
                  const buffer = Buffer.concat(chunks);
                  const filesCollection = db.collection('fs.files');
                  const fileDoc = await filesCollection.findOne({ _id: new mongoose.Types.ObjectId(fileId) });
                  const mimeType = fileDoc?.contentType || 'audio/webm';

                  const transcript = await transcriptionService.transcribe(buffer, mimeType);

                  if (transcript) {
                    console.log('[Backend] Transcription success');
                    const translationResult = await messageService.processMessageTranslation(
                      { ...messageData, senderId: userId, receiverId: incoming.receiverId },
                      transcript
                    );

                    const updateData = { 'metadata.transcript': transcript };
                    if (translationResult.translatedText) {
                      updateData['metadata.translatedTranscript'] = translationResult.translatedText;
                      updateData['metadata.targetLanguage'] = translationResult.translatedLanguage;
                    }

                    const updatedMsg = await Message.findByIdAndUpdate(
                      saved._id,
                      { $set: updateData },
                      { new: true }
                    );

                    const updatedDTO = await messageService.convertToDTO(updatedMsg);
                    io.to(`user:${userId}`).emit('message.updated', updatedDTO);
                    io.to(`user:${incoming.receiverId}`).emit('message.updated', updatedDTO);
                  }
                } catch (asyncErr) {
                  console.error('Error inside stream end:', asyncErr);
                }
              });

              downloadStream.on('error', (err) => {
                console.error('[Backend] Error reading audio file stream:', err);
              });

            } catch (err) {
              console.error('[Backend] Async audio processing setup failed:', err);
            }
          })();
        }

        // Bot command check
        if (incoming.content && botService.isBotCommand(incoming.content)) {
          handleBotMessage(io, socket, incoming, saved);
        }

      } catch (error) {
        console.error('!!! Critical Error handling chat.send:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle chat.edit
    socket.on('chat.edit', async (incoming) => {
      try {
        const message = await Message.findById(incoming.id);
        if (!message) return;

        // SECURITY: Ownership check - only sender can edit their messages
        if (message.senderId !== socket.userId) {
          console.error(`[SECURITY] User ${socket.userId} attempted to edit message owned by ${message.senderId}`);
          socket.emit('error', { message: 'Unauthorized: You can only edit your own messages' });
          return;
        }

        message.content = incoming.content;
        message.edited = true;
        message.editedAt = new Date();

        const saved = await message.save();
        const messageDTO = await messageService.convertToDTO(saved);

        io.emit('messages.edited', messageDTO);
      } catch (error) {
        console.error('Error handling chat.edit:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Handle chat.delete
    socket.on('chat.delete', async (incoming) => {
      try {
        const message = await Message.findById(incoming.id);
        if (!message) return;

        // SECURITY: Ownership check - only sender can delete their messages
        if (message.senderId !== socket.userId) {
          console.error(`[SECURITY] User ${socket.userId} attempted to delete message owned by ${message.senderId}`);
          socket.emit('error', { message: 'Unauthorized: You can only delete your own messages' });
          return;
        }

        message.deleted = true;
        const saved = await message.save();
        const messageDTO = await messageService.convertToDTO(saved);

        io.emit('messages.deleted', messageDTO);
      } catch (error) {
        console.error('Error handling chat.delete:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle chat.typing
    socket.on('chat.typing', (payload) => {
      try {
        const userId = socket.userId;
        const username = socket.username;
        const { receiverId } = payload;

        if (!receiverId) {
          console.error('Missing receiverId in typing message');
          return;
        }

        // Emit typing event with sender info
        io.to(`user:${receiverId}`).emit('typing', {
          senderId: userId,
          username: username,
          type: 'typing'
        });

        console.log(`Typing event: ${username} (${userId}) -> ${receiverId}`);
      } catch (error) {
        console.error('Error handling chat.typing:', error);
      }
    });

    // Handle chat.read
    socket.on('chat.read', async (payload) => {
      try {
        const { messageId } = payload;
        const userId = socket.userId;

        if (!messageId || !userId) {
          console.error('Missing messageId or userId in read message');
          return;
        }

        const message = await Message.findById(messageId);
        if (!message) {
          console.error('Message not found:', messageId);
          return;
        }

        // Only mark as read if the current user is the receiver
        if (userId !== message.receiverId) {
          console.error('User', userId, 'is not authorized to mark message', messageId, 'as read');
          return;
        }

        // Mark as read
        message.read = true;
        message.readAt = new Date();
        const savedMessage = await message.save();

        // Convert to DTO and notify the sender about read receipt
        const messageDTO = await messageService.convertToDTO(savedMessage);
        io.to(`user:${message.senderId}`).emit('MESSAGE_READ', {
          type: 'MESSAGE_READ',
          message: messageDTO
        });
      } catch (error) {
        console.error('Error handling chat.read:', error);
      }
    });

    // Handle message:sync (SDE 3: Reconnection resilience)
    socket.on('message:sync', async (payload) => {
      try {
        const userId = socket.userId;
        const { lastMessageId } = payload;

        console.log(`[Sync] User ${userId} requesting sync. Last message: ${lastMessageId || 'none'}`);

        // Find all conversations where user is a participant
        const conversations = await Conversation.find({
          $or: [
            { participantA: userId },
            { participantB: userId }
          ]
        });

        const conversationIds = conversations.map(c => c._id);

        let query = {
          conversationId: { $in: conversationIds },
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ]
        };

        // If lastMessageId provided, get only newer messages
        if (lastMessageId && mongoose.Types.ObjectId.isValid(lastMessageId)) {
          const lastMessage = await Message.findById(lastMessageId);
          if (lastMessage) {
            query.timestamp = { $gt: lastMessage.timestamp };
          }
        }

        // Fetch missed messages (limit to 100 for safety)
        const missedMessages = await Message.find(query)
          .sort({ timestamp: 1 })
          .limit(100)
          .populate('replyTo', 'senderId type content metadata timestamp');

        // CRITICAL PRIVACY FIREWALL: Double-check each message authorization
        // This is a safety net in case the query has bugs
        const authorizedMessages = missedMessages.filter(msg => {
          const isAuthorized = (
            msg.senderId === userId ||
            msg.receiverId === userId
          );

          if (!isAuthorized) {
            console.error(`[SECURITY] Prevented leaking message ${msg._id} to unauthorized user ${userId}`);
            console.error(`[SECURITY] Message sender: ${msg.senderId}, receiver: ${msg.receiverId}`);
          }

          return isAuthorized;
        });

        if (authorizedMessages.length < missedMessages.length) {
          console.error(`[SECURITY] Blocked ${missedMessages.length - authorizedMessages.length} unauthorized messages!`);
        }

        // Convert to DTOs (batch for efficiency - single DB query for all senders)
        const messageDTOs = await messageService.convertToDTOs(authorizedMessages);

        console.log(`[Sync] Sending ${messageDTOs.length} missed messages to user ${userId}`);

        // Warn if sync is truncated (user may have missed messages)
        const isTruncated = messageDTOs.length === 100;
        if (isTruncated) {
          console.warn(`[Sync] WARNING: User ${userId} sync truncated at 100 messages - may have missed older messages`);
        }

        // Send sync response
        socket.emit('message:sync_response', {
          messages: messageDTOs,
          count: messageDTOs.length,
          hasMore: isTruncated,
          truncated: isTruncated  // Explicit flag for frontend to show warning
        });

      } catch (error) {
        console.error('Error handling message:sync:', error);
        socket.emit('error', { message: 'Sync failed. Please refresh.' });
      }
    });

    // Handle voice call signaling
    socket.on('call.offer', (data) => {
      try {
        console.log('Call offer from', socket.userId, 'to', data.receiverId);
        io.to(`user:${data.receiverId}`).emit('call.offer', {
          senderId: socket.userId,
          callerName: socket.username,
          offer: data.offer
        });
      } catch (error) {
        console.error('Error handling call.offer:', error);
      }
    });

    socket.on('call.answer', (data) => {
      try {
        console.log('Call answer from', socket.userId, 'to', data.receiverId);
        io.to(`user:${data.receiverId}`).emit('call.answer', {
          senderId: socket.userId,
          answer: data.answer
        });
      } catch (error) {
        console.error('Error handling call.answer:', error);
      }
    });

    socket.on('call.ice-candidate', (data) => {
      try {
        io.to(`user:${data.receiverId}`).emit('call.ice-candidate', {
          senderId: socket.userId,
          candidate: data.candidate
        });
      } catch (error) {
        console.error('Error handling call.ice-candidate:', error);
      }
    });

    socket.on('call.reject', (data) => {
      try {
        console.log('Call rejected by', socket.userId);
        io.to(`user:${data.receiverId}`).emit('call.reject', {
          senderId: socket.userId
        });
      } catch (error) {
        console.error('Error handling call.reject:', error);
      }
    });

    socket.on('call.end', (data) => {
      try {
        console.log('Call ended by', socket.userId);
        io.to(`user:${data.receiverId}`).emit('call.end', {
          senderId: socket.userId
        });
      } catch (error) {
        console.error('Error handling call.end:', error);
      }
    });

    // Handle video call signaling
    socket.on('video-call.offer', (data) => {
      try {
        console.log('Video call offer from', socket.userId, 'to', data.receiverId);
        io.to(`user:${data.receiverId}`).emit('video-call.offer', {
          senderId: socket.userId,
          callerName: socket.username,
          offer: data.offer
        });
      } catch (error) {
        console.error('Error handling video-call.offer:', error);
      }
    });

    socket.on('video-call.answer', (data) => {
      try {
        console.log('Video call answer from', socket.userId, 'to', data.receiverId);
        io.to(`user:${data.receiverId}`).emit('video-call.answer', {
          senderId: socket.userId,
          answer: data.answer
        });
      } catch (error) {
        console.error('Error handling video-call.answer:', error);
      }
    });

    socket.on('video-call.ice-candidate', (data) => {
      try {
        io.to(`user:${data.receiverId}`).emit('video-call.ice-candidate', {
          senderId: socket.userId,
          candidate: data.candidate
        });
      } catch (error) {
        console.error('Error handling video-call.ice-candidate:', error);
      }
    });

    socket.on('video-call.reject', (data) => {
      try {
        console.log('Video call rejected by', socket.userId);
        io.to(`user:${data.receiverId}`).emit('video-call.reject', {
          senderId: socket.userId
        });
      } catch (error) {
        console.error('Error handling video-call.reject:', error);
      }
    });

    socket.on('video-call.end', (data) => {
      try {
        console.log('Video call ended by', socket.userId);
        io.to(`user:${data.receiverId}`).emit('video-call.end', {
          senderId: socket.userId
        });
      } catch (error) {
        console.error('Error handling video-call.end:', error);
      }
    });

    // ========== GROUP CHAT EVENTS ==========

    // Join a group room
    socket.on('group.join', async (data) => {
      try {
        const { groupId } = data;
        const userId = socket.userId;

        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        if (!group.isMember(userId)) {
          socket.emit('error', { message: 'You are not a member of this group' });
          return;
        }

        socket.join(`group:${groupId}`);
        console.log(`User ${userId} joined group room: ${groupId}`);

        socket.emit('group.joined', { groupId });
      } catch (error) {
        console.error('Error handling group.join:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Leave a group room
    socket.on('group.leave', (data) => {
      const { groupId } = data;
      socket.leave(`group:${groupId}`);
      console.log(`User ${socket.userId} left group room: ${groupId}`);
    });

    // Send message to group
    socket.on('group.send', async (incoming) => {
      try {
        const userId = socket.userId;
        const { groupId, content, type = 'text', replyTo, metadata } = incoming;

        console.log(`[group.send] User ${userId} sending to group ${groupId}:`, content?.substring(0, 50));

        if (!groupId || !content) {
          console.log(`[group.send] Error: Missing groupId or content`);
          socket.emit('error', { message: 'Group ID and content are required' });
          return;
        }

        // Rate limiting
        const rateCheck = rateLimiter.checkLimit(userId);
        if (!rateCheck.allowed) {
          socket.emit('error:rate_limit', {
            message: 'Too many messages. Please slow down.',
            retryAfter: rateCheck.retryAfter
          });
          return;
        }

        // Verify membership
        const group = await Group.findById(groupId).populate('members', 'username displayName');
        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        if (!group.isMember(userId)) {
          socket.emit('error', { message: 'You are not a member of this group' });
          return;
        }

        // Check if only admins can post
        if (group.settings?.onlyAdminsCanPost && !group.isAdmin(userId)) {
          socket.emit('error', { message: 'Only admins can send messages in this group' });
          return;
        }

        // Parse mentions
        const mentions = groupAIService.parseMentions(content, group.members);

        // Get sender info
        const sender = await User.findById(userId).select('username displayName avatarUrl');

        // Create message
        const message = new Message({
          senderId: userId,
          senderDisplayName: sender?.displayName || sender?.username,
          groupId,
          type,
          content,
          mentions,
          replyTo: replyTo || null,
          metadata: metadata || null,
          timestamp: new Date(),
          delivered: true,
          deliveredAt: new Date()
        });

        const saved = await message.save();
        console.log(`Group message saved: ${saved._id} in group ${groupId}`);

        // Update group's last message
        group.lastMessageAt = new Date();
        group.lastMessagePreview = type === 'text'
          ? content.substring(0, 50) + (content.length > 50 ? '...' : '')
          : `[${type}]`;
        await group.save();

        // Create DTO for broadcast
        const messageDTO = {
          id: saved._id,
          senderId: saved.senderId,
          senderDisplayName: saved.senderDisplayName,
          senderAvatar: sender?.avatarUrl,
          groupId: saved.groupId,
          type: saved.type,
          content: saved.content,
          mentions: saved.mentions,
          replyTo: saved.replyTo,
          metadata: saved.metadata,
          timestamp: saved.timestamp,
          isBot: saved.isBot,
          deleted: saved.deleted
        };

        // Broadcast to all group members
        io.to(`group:${groupId}`).emit('group.message', messageDTO);

        // Handle @AI mentions
        const hasAIMention = mentions.some(m => m.type === 'ai');
        if (hasAIMention && group.settings?.aiEnabled !== false) {
          handleGroupAIMention(io, groupId, content, userId, sender);
        }

      } catch (error) {
        console.error('Error handling group.send:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Group typing indicator
    socket.on('group.typing', (data) => {
      try {
        const { groupId } = data;
        const userId = socket.userId;
        const username = socket.username;

        // Broadcast to all group members except sender
        socket.to(`group:${groupId}`).emit('group.typing', {
          groupId,
          userId,
          username,
          type: 'typing'
        });
      } catch (error) {
        console.error('Error handling group.typing:', error);
      }
    });

    // Group message delete (by sender or admin)
    socket.on('group.delete', async (data) => {
      try {
        const { groupId, messageId } = data;
        const userId = socket.userId;

        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        const message = await Message.findOne({ _id: messageId, groupId });
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Admins can delete any message, members can only delete their own
        if (message.senderId !== userId && !group.isAdmin(userId)) {
          socket.emit('error', { message: 'You can only delete your own messages' });
          return;
        }

        message.deleted = true;
        await message.save();

        // Broadcast deletion to group
        io.to(`group:${groupId}`).emit('group.message_deleted', {
          groupId,
          messageId
        });

        console.log(`Group message ${messageId} deleted by ${userId}`);
      } catch (error) {
        console.error('Error handling group.delete:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // ========== END GROUP CHAT EVENTS ==========

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);

      // Broadcast user offline status to all connected users
      socket.broadcast.emit('user:status', {
        userId: socket.userId,
        username: socket.username,
        status: 'offline'
      });
    });
  });
};

/**
 * Handle bot messages - process and respond to bot commands
 */
async function handleBotMessage(io, socket, incoming, userMessage) {
  try {
    const userId = socket.userId;
    const conversationId = userMessage.conversationId;

    console.log('Processing bot command:', incoming.content);

    // Get recent conversation context
    const recentMessages = await Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('senderId content timestamp isBot')
      .lean();

    const context = {
      recentMessages: recentMessages.reverse().map(msg => ({
        sender: msg.isBot ? 'Bot' : 'User',
        text: msg.content,
        timestamp: msg.timestamp
      })),
      userId,
      conversationId
    };

    // Process through bot service
    const botResponse = await botService.handleBotMessage(incoming.content, context);

    if (botResponse.success && botResponse.response) {
      // Create bot message
      const botMessageData = {
        senderId: 'bot',
        receiverId: userId,
        conversationId: conversationId,
        type: 'text',
        content: botResponse.response,
        isBot: true,
        timestamp: new Date(),
        delivered: true,
        deliveredAt: new Date()
      };

      const botMessage = new Message(botMessageData);
      const savedBotMessage = await botMessage.save();

      // Convert to DTO
      const botMessageDTO = await messageService.convertToDTO(savedBotMessage);

      // Emit bot response to user
      console.log('Sending bot response to user:', userId);
      io.to(`user:${userId}`).emit('message', botMessageDTO);

      // Also emit to the receiver if this is a group conversation
      if (incoming.receiverId && incoming.receiverId !== userId) {
        io.to(`user:${incoming.receiverId}`).emit('message', botMessageDTO);
      }
    } else {
      console.error('Bot service error:', botResponse.error);
      // Send error message as bot response
      const errorMessage = new Message({
        senderId: 'bot',
        receiverId: userId,
        conversationId: conversationId,
        type: 'text',
        content: botResponse.response || 'Sorry, I encountered an error.',
        isBot: true,
        timestamp: new Date()
      });

      const saved = await errorMessage.save();
      const dto = await messageService.convertToDTO(saved);
      io.to(`user:${userId}`).emit('message', dto);
    }
  } catch (error) {
    console.error('Error in handleBotMessage:', error);
    // Don't emit error to avoid disrupting user experience
  }
}

/**
 * Handle @AI mentions in group chats
 * AI responses are public in the group
 */
async function handleGroupAIMention(io, groupId, messageContent, senderId, sender) {
  try {
    console.log(`Processing @AI mention in group ${groupId}`);

    // Extract query from message
    const query = groupAIService.extractAIQuery(messageContent);

    // Process the AI query
    const aiResponse = await groupAIService.handleAIMention(query, groupId, { senderId });

    if (aiResponse.success && aiResponse.response) {
      // Create AI response message
      const aiMessage = new Message({
        senderId: 'ai-assistant',
        senderDisplayName: 'AI Assistant',
        groupId,
        type: 'text',
        content: aiResponse.response,
        isBot: true,
        mentions: [{ type: 'user', userId: senderId, displayName: sender?.displayName }],
        timestamp: new Date(),
        delivered: true,
        deliveredAt: new Date()
      });

      const savedAIMessage = await aiMessage.save();
      console.log(`AI response saved: ${savedAIMessage._id}`);

      // Create DTO for broadcast
      const aiMessageDTO = {
        id: savedAIMessage._id,
        senderId: savedAIMessage.senderId,
        senderDisplayName: savedAIMessage.senderDisplayName,
        senderAvatar: null, // AI has no avatar
        groupId: savedAIMessage.groupId,
        type: savedAIMessage.type,
        content: savedAIMessage.content,
        mentions: savedAIMessage.mentions,
        timestamp: savedAIMessage.timestamp,
        isBot: true,
        deleted: false
      };

      // Broadcast AI response to all group members (public)
      io.to(`group:${groupId}`).emit('group.message', aiMessageDTO);

      console.log(`AI response broadcast to group ${groupId}`);
    } else {
      console.error('AI mention processing failed:', aiResponse.error);

      // Send error response to group
      const errorMessage = new Message({
        senderId: 'ai-assistant',
        senderDisplayName: 'AI Assistant',
        groupId,
        type: 'text',
        content: aiResponse.response || "Sorry, I couldn't process that request.",
        isBot: true,
        timestamp: new Date()
      });

      const saved = await errorMessage.save();
      const errorDTO = {
        id: saved._id,
        senderId: saved.senderId,
        senderDisplayName: saved.senderDisplayName,
        groupId: saved.groupId,
        type: saved.type,
        content: saved.content,
        timestamp: saved.timestamp,
        isBot: true,
        deleted: false
      };

      io.to(`group:${groupId}`).emit('group.message', errorDTO);
    }
  } catch (error) {
    console.error('Error in handleGroupAIMention:', error);
  }
}
