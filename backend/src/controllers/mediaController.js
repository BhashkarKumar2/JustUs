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
    if (file.metadata && (file.metadata.conversationId || file.metadata.groupId)) {

      // Case 1: Group Chat File
      if (file.metadata.groupId) {
        const groupId = file.metadata.groupId;
        console.log('MediaController: File belongs to group:', groupId);

        try {
          const group = await Group.findById(groupId);

          if (!group) {
            console.log('MediaController: Group not found:', groupId);
            return res.status(404).json({ message: 'Group not found' });
          }

          const isMember = group.isMember(req.userId);
          if (!isMember) {
            console.log('MediaController: User', req.userId, 'is not a member of group', groupId);
            return res.status(403).json({ message: 'Access denied' });
          }

          console.log('MediaController: Group access granted for user', req.userId, 'to file', id);
        } catch (err) {
          console.error('MediaController: Group check error', err);
          return res.status(500).json({ message: 'Server error checking permissions' });
        }

      }
      // Case 2: Direct Conversation File
      else if (file.metadata.conversationId) {
        const convId = file.metadata.conversationId;
        console.log('MediaController: File belongs to conversation:', convId);

        const conversation = await Conversation.findById(convId);
        console.log('MediaController: Current user ID:', req.userId);

        if (!conversation) {
          console.log('MediaController: Conversation not found:', convId);
          return res.status(403).json({ message: 'Access denied' });
        }

        console.log('MediaController: Conversation participants:', conversation.participantA, ',', conversation.participantB);

        if (req.userId !== conversation.participantA && req.userId !== conversation.participantB) {
          console.log('MediaController: User', req.userId, 'is not a participant in conversation', convId);
          return res.status(403).json({ message: 'Access denied' });
        }

        console.log('MediaController: Access granted for user', req.userId, 'to file', id);
      }
    } else {
      // Fallback: Check if this file is used in a message that the user has access to
      // This handles legacy files uploaded before metadata was mandatory
      console.log(`[SECURITY] File ${id} has no valid metadata - checking Message usage`);

      const Message = mongoose.model('Message');
      // Find a message that contains this file ID in its content
      // content is usually /api/media/file/<id>
      const message = await Message.findOne({
        content: { $regex: id }
      });

      if (message) {
        console.log(`[SECURITY] Found message ${message._id} referencing file ${id}`);

        if (message.groupId) {
          // Check group access
          const group = await Group.findById(message.groupId);
          if (group && group.isMember(req.userId)) {
            console.log(`[SECURITY] Access granted via Group Message reference in group ${group._id}`);
          } else {
            console.log(`[SECURITY] User ${req.userId} is not a member of group ${message.groupId}`);
            return res.status(403).json({ message: 'Access denied' });
          }
        } else if (message.conversationId) {
          const conversation = await Conversation.findById(message.conversationId);

          if (conversation && (conversation.participantA === req.userId || conversation.participantB === req.userId)) {
            console.log(`[SECURITY] Access granted via Message reference in conversation ${conversation._id}`);
            // Access granted - proceed to stream
          } else {
            console.log(`[SECURITY] User ${req.userId} is not part of conversation ${message.conversationId}`);
            return res.status(403).json({ message: 'Access denied' });
          }
        } else {
          // Orphaned message type?
          console.log(`[SECURITY] Message ${message._id} has neither groupId nor conversationId`);
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        // Check if it is a Group Avatar (for legacy files without metadata)
        console.log(`[SECURITY] Checking if file ${id} is a Group Avatar`);
        const groupAvatar = await Group.findOne({ avatarUrl: { $regex: id } });

        if (groupAvatar) {
          console.log(`[SECURITY] File ${id} is avatar for group ${groupAvatar._id}`);
          if (groupAvatar.isMember(req.userId)) {
            console.log(`[SECURITY] Access granted via Group Avatar reference`);
            // Access granted
          } else {
            console.log(`[SECURITY] User ${req.userId} is not member of group ${groupAvatar._id}`);
            return res.status(403).json({ message: 'Access denied' });
          }
        }
        else {
          // Check if it is a User Avatar
          console.log(`[SECURITY] Checking if file ${id} is a User Avatar`);
          const userAvatar = await User.findOne({ avatarUrl: { $regex: id } });

          if (userAvatar) {
            console.log(`[SECURITY] File ${id} is avatar for user ${userAvatar._id}`);
            // User avatars are generally visible to authenticated users
            console.log(`[SECURITY] Access granted via User Avatar reference`);
          } else {
            console.log(`[SECURITY] File ${id} is orphaned (no metadata, no message ref, no avatar ref) - denying access`);
            return res.status(403).json({ message: 'Access denied: File not associated with a contextual source' });
          }
        }
      }
    }

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
