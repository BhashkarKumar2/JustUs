import mongoose from 'mongoose';
import multer from 'multer';
import { GridFsStorage } from 'multer-gridfs-storage';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';

import Group from '../models/Group.js';
import User from '../models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/justus';

// Create GridFS storage that reuses the existing connection
const storage = new GridFsStorage({
  db: mongoose.connection,
  file: (req, file) => {
    console.log('GridFS: Preparing to store file:', file.originalname);
    console.log('GridFS: ConversationId:', req.body.conversationId || req.query.conversationId);
    return {
      filename: file.originalname,
      bucketName: 'fs',
      metadata: {
        conversationId: req.body.conversationId || req.query.conversationId,
        groupId: req.body.groupId || req.query.groupId
      }
    };
  }
});

const upload = multer({ storage });

// Middleware export
export const uploadMiddleware = upload.single('file');

export const uploadFile = (req, res) => {
  try {
    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('=== FILE UPLOAD SUCCESS ===');
    console.log('File ID:', req.file.id.toString());
    console.log('Filename:', req.file.filename);
    console.log('ContentType:', req.file.contentType);
    console.log('ConversationId:', req.body.conversationId || req.query.conversationId);
    console.log('GroupId:', req.body.groupId || req.query.groupId);
    console.log('Database:', mongoose.connection.db.databaseName);
    console.log('===========================');

    res.json({
      id: req.file.id.toString(),
      filename: req.file.filename,
      contentType: req.file.contentType
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getFile = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('=== FILE RETRIEVAL REQUEST ===');
    console.log('File ID:', id);
    console.log('User ID:', req.userId);
    console.log('Database:', mongoose.connection.db.databaseName);

    if (!req.userId) {
      console.log('MediaController: No authentication found, returning 401');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const db = mongoose.connection.db;
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'fs' });

    // Find the file
    const filesCollection = db.collection('fs.files');

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('MediaController: Invalid ObjectId format:', id);
      return res.status(400).json({ message: 'Invalid file ID format' });
    }

    const file = await filesCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!file) {
      console.log('MediaController: File not found with ID:', id);
      return res.status(404).json({ message: 'File not found' });
    }

    // Check conversation membership if metadata present
    let accessGranted = false;

    if (file.metadata && (file.metadata.conversationId || file.metadata.groupId)) {

      // Case 1: Group Chat File (Primary Metadata Check)
      if (file.metadata.groupId) {
        const groupId = file.metadata.groupId;
        // Optimization: Use exists() instead of finding the whole group
        const isMember = await Group.exists({ _id: groupId, members: req.userId });

        if (isMember) {
          console.log('MediaController: User is member of origin group:', groupId);
          accessGranted = true;
        } else {
          console.log('MediaController: User NOT member of origin group:', groupId, '- checking context fallback');
        }
      }
      // Case 2: Direct Conversation File (Primary Metadata Check)
      else if (file.metadata.conversationId) {
        const convId = file.metadata.conversationId;
        const conversation = await Conversation.findOne({
          _id: convId,
          $or: [{ participantA: req.userId }, { participantB: req.userId }]
        }).select('_id');

        if (conversation) {
          console.log('MediaController: User is participant of origin conversation:', convId);
          accessGranted = true;
        } else {
          console.log('MediaController: User NOT participant of origin conversation:', convId, '- checking context fallback');
        }
      }
    }

    // FALLBACK: Context-Aware Check
    // If primary metadata check failed (or no metadata), check if this file is actually being USED
    // in a message that the user HAS access to.
    if (!accessGranted) {
      console.log(`[SECURITY] Access not granted by origin - checking if file ${id} is referenced in a visible message`);

      const Message = mongoose.model('Message');

      // Find ANY message that references this file
      // We limit to 1 because we only need ONE valid context to grant access
      const referenceMessages = await Message.find({
        content: { $regex: id } // Matches the file ID in the URL
      }).limit(5); // Check a few recent usages

      for (const message of referenceMessages) {
        if (message.groupId) {
          // Is user in this group?
          const isMember = await Group.exists({ _id: message.groupId, members: req.userId });
          if (isMember) {
            console.log(`[SECURITY] Access granted via Reference: User is in group ${message.groupId} where file is shared`);
            accessGranted = true;
            break;
          }
        } else if (message.conversationId) {
          // Is user in this conversation?
          const conversation = await Conversation.exists({
            _id: message.conversationId,
            $or: [{ participantA: req.userId }, { participantB: req.userId }]
          });
          if (conversation) {
            console.log(`[SECURITY] Access granted via Reference: User is in conversation ${message.conversationId} where file is shared`);
            accessGranted = true;
            break;
          }
        }
      }
    }

    // FINAL LEGACY FALLBACK: Check Avatars
    if (!accessGranted) {
      console.log(`[SECURITY] Message reference check failed - checking Avatars`);
      // Check Group Avatar
      const groupAvatar = await Group.exists({ avatarUrl: { $regex: id }, members: req.userId });
      if (groupAvatar) {
        console.log(`[SECURITY] Access granted: File is an avatar for a group the user is in`);
        accessGranted = true;
      } else {
        // Check User Avatar (Public)
        const userAvatar = await User.exists({ avatarUrl: { $regex: id } });
        if (userAvatar) {
          console.log(`[SECURITY] Access granted: File is a user avatar`);
          accessGranted = true;
        }
      }
    }

    if (!accessGranted) {
      console.log(`[SECURITY] DENIED: File ${id} has no valid context for user ${req.userId}`);
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log('MediaController: Access validated. Streaming file...');

    // Stream the file
    console.log('MediaController: Returning file:', file.filename);

    // Set CORS headers for cross-origin resource access (needed for CSS backgrounds, canvas, etc.)
    const origin = req.headers.origin;
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
    }

    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file' });
      } else {
        res.end();
      }
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ message: 'Failed to retrieve file' });
  }
};
