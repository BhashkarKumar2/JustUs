import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import {
    createGroup,
    getGroups,
    getGroupById,
    updateGroup,
    deleteGroup,
    addMembers,
    removeMember,
    leaveGroup,
    getGroupMessages,
    promoteToAdmin,
    demoteAdmin,
    joinViaInvite,
    deleteGroupMessage,
    pinMessage,
    getPinnedMessages,
    searchGroupMessages
} from '../controllers/groupController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Group CRUD
router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:id', getGroupById);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

// Member management
router.post('/:id/members', addMembers);
router.delete('/:id/members/:memberId', removeMember);
router.post('/:id/leave', leaveGroup);

// Messages
router.get('/:id/messages/search', searchGroupMessages);
router.get('/:id/messages', getGroupMessages);
router.delete('/:id/messages/:messageId', deleteGroupMessage);

// Pinned messages
router.post('/:id/pin/:messageId', pinMessage);
router.get('/:id/pinned', getPinnedMessages);

// Admin management
router.post('/:id/admins', promoteToAdmin);
router.delete('/:id/admins/:adminId', demoteAdmin);

// Join via invite
router.post('/join/:inviteCode', joinViaInvite);

export default router;
