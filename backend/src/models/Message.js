import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true
  },
  senderDisplayName: {
    type: String,
    default: null
  },
  receiverId: {
    type: String,
    required: function () {
      // Required only for 1-to-1 chats (when groupId is not set)
      return !this.groupId;
    }
  },
  conversationId: {
    type: String,
    required: function () {
      // Required only if groupId is not set (1-to-1 chat)
      return !this.groupId;
    }
  },
  // Group chat support
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  // @mentions in message (for @AI and @user)
  mentions: [{
    type: { type: String, enum: ['user', 'ai'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for @AI
    displayName: { type: String }
  }],
  type: {
    type: String,
    enum: ['text', 'image', 'audio', 'video', 'document', 'call'],
    default: 'text'
  },
  content: {
    type: String,
    required: true
  },
  // Translation fields
  originalLanguage: {
    type: String,
    default: null
  },
  translatedText: {
    type: String,
    default: null
  },
  translatedLanguage: {
    type: String,
    default: null
  },
  showOriginal: {
    type: Boolean,
    default: false
  },
  // Encryption: nonce used for decryption (stored plaintext, not secret)
  encryptionNonce: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Reply to message feature
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  deleted: {
    type: Boolean,
    default: false
  },
  // Read receipts
  delivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  // Bot message fields
  isBot: {
    type: Boolean,
    default: false
  },
  isBotQuery: {
    type: Boolean,
    default: false
  },
  botContext: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  collection: 'messages'
});

// Indexes for performance
messageSchema.index({ conversationId: 1, timestamp: -1 }); // Fast history retrieval
messageSchema.index({ groupId: 1, timestamp: -1 });        // Fast group history retrieval
messageSchema.index({ senderId: 1, timestamp: -1 });       // Fast "my sent" retrieval
messageSchema.index({ receiverId: 1, timestamp: -1 });     // Fast "my received" retrieval

const Message = mongoose.model('Message', messageSchema);

export default Message;
