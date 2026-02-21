import Group from '../models/Group.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

/**
 * Group Controller - Handles all group-related API requests
 */

/**
 * Create a new group
 * POST /api/groups
 */
export const createGroup = async (req, res) => {
    try {
        const userId = req.userId;
        const { name, description, memberIds, avatarUrl } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Group name is required' });
        }

        // Validate member count (including creator)
        const uniqueMembers = [...new Set([userId, ...(memberIds || [])])];
        if (uniqueMembers.length > Group.MAX_MEMBERS) {
            return res.status(400).json({
                message: `Group cannot exceed ${Group.MAX_MEMBERS} members`
            });
        }

        // Generate unique invite code
        let inviteCode;
        let attempts = 0;
        while (attempts < 5) {
            inviteCode = Group.generateInviteCode();
            const existing = await Group.findOne({ inviteCode });
            if (!existing) break;
            attempts++;
        }

        const group = new Group({
            name: name.trim(),
            description: description?.trim() || '',
            avatarUrl: avatarUrl || null,
            creator: userId,
            admins: [userId],
            members: uniqueMembers,
            inviteCode
        });

        await group.save();

        // Populate creator info for response
        await group.populate('creator', 'username displayName avatarUrl');
        await group.populate('members', 'username displayName avatarUrl');

        console.log(`Group created: ${group.name} by user ${userId}`);

        res.status(201).json({
            success: true,
            group: {
                id: group._id,
                name: group.name,
                description: group.description,
                avatarUrl: group.avatarUrl,
                creator: group.creator,
                admins: group.admins,
                members: group.members,
                memberCount: group.members.length,
                inviteCode: group.inviteCode,
                settings: group.settings,
                createdAt: group.createdAt
            }
        });
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ message: 'Failed to create group', error: error.message });
    }
};

/**
 * Get all groups for current user
 * GET /api/groups
 */
export const getGroups = async (req, res) => {
    try {
        const userId = req.userId;
        console.log(`[getGroups] Fetching groups for userId: ${userId}`);

        const groups = await Group.find({ members: userId })
            .populate('creator', 'username displayName avatarUrl')
            .populate('members', 'username displayName avatarUrl')
            .sort({ lastMessageAt: -1, updatedAt: -1 });

        console.log(`[getGroups] Found ${groups.length} groups for user ${userId}`);
        groups.forEach(g => {
            console.log(`[getGroups]   - Group: ${g.name} (id: ${g._id}), members: ${g.members.length}`);
        });

        const groupList = groups.map(g => ({
            id: g._id,
            name: g.name,
            description: g.description,
            avatarUrl: g.avatarUrl,
            memberCount: g.members.length,
            isAdmin: g.isAdmin(userId),
            isCreator: g.isCreator(userId),
            lastMessageAt: g.lastMessageAt,
            lastMessagePreview: g.lastMessagePreview,
            settings: g.settings,
            updatedAt: g.updatedAt
        }));

        res.json({ success: true, groups: groupList });
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ message: 'Failed to fetch groups', error: error.message });
    }
};

/**
 * Get single group by ID
 * GET /api/groups/:id
 */
export const getGroupById = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        console.log(`[getGroupById] userId: ${userId}, groupId: ${id}`);

        const group = await Group.findById(id)
            .populate('creator', 'username displayName avatarUrl')
            .populate('admins', 'username displayName avatarUrl')
            .populate('members', 'username displayName avatarUrl');

        if (!group) {
            console.log(`[getGroupById] Group not found: ${id}`);
            return res.status(404).json({ message: 'Group not found' });
        }

        console.log(`[getGroupById] Group found: ${group.name}`);
        console.log(`[getGroupById] Group members:`, group.members.map(m => m._id?.toString() || m.toString()));
        console.log(`[getGroupById] Checking if ${userId} is member...`);

        const isMember = group.isMember(userId);
        console.log(`[getGroupById] isMember result: ${isMember}`);

        if (!isMember) {
            console.log(`[getGroupById] 403 - User ${userId} is not a member of group ${id}`);
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        res.json({
            success: true,
            group: {
                id: group._id,
                name: group.name,
                description: group.description,
                avatarUrl: group.avatarUrl,
                creator: group.creator,
                admins: group.admins,
                members: group.members,
                memberCount: group.members.length,
                inviteCode: group.isAdmin(userId) ? group.inviteCode : undefined,
                settings: group.settings,
                isAdmin: group.isAdmin(userId),
                isCreator: group.isCreator(userId),
                createdAt: group.createdAt,
                updatedAt: group.updatedAt
            }
        });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ message: 'Failed to fetch group', error: error.message });
    }
};

/**
 * Update group info
 * PUT /api/groups/:id
 */
export const updateGroup = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, description, avatarUrl, settings } = req.body;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isAdmin(userId)) {
            return res.status(403).json({ message: 'Only admins can update group info' });
        }

        if (name) group.name = name.trim();
        if (description !== undefined) group.description = description.trim();
        if (avatarUrl !== undefined) group.avatarUrl = avatarUrl;
        if (settings) {
            group.settings = { ...group.settings.toObject(), ...settings };
        }

        await group.save();
        await group.populate('members', 'username displayName avatarUrl');

        res.json({ success: true, group });
    } catch (error) {
        console.error('Update group error:', error);
        res.status(500).json({ message: 'Failed to update group', error: error.message });
    }
};

/**
 * Delete group
 * DELETE /api/groups/:id
 */
export const deleteGroup = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isCreator(userId)) {
            return res.status(403).json({ message: 'Only the group creator can delete the group' });
        }

        // Delete all group messages
        await Message.deleteMany({ groupId: id });

        // Delete the group
        await Group.findByIdAndDelete(id);

        console.log(`Group deleted: ${group.name} by user ${userId}`);
        res.json({ success: true, message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Delete group error:', error);
        res.status(500).json({ message: 'Failed to delete group', error: error.message });
    }
};

/**
 * Add members to group
 * POST /api/groups/:id/members
 */
export const addMembers = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { memberIds } = req.body;

        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ message: 'Member IDs are required' });
        }

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isAdmin(userId)) {
            return res.status(403).json({ message: 'Only admins can add members' });
        }

        // Check member limit
        const currentMembers = group.members.map(m => m.toString());
        const newMembers = memberIds.filter(m => !currentMembers.includes(m));

        if (currentMembers.length + newMembers.length > Group.MAX_MEMBERS) {
            return res.status(400).json({
                message: `Cannot add members. Group would exceed ${Group.MAX_MEMBERS} member limit.`
            });
        }

        // Verify new members exist
        const validUsers = await User.find({ _id: { $in: newMembers } });
        const validIds = validUsers.map(u => u._id);

        group.members.push(...validIds);
        await group.save();
        await group.populate('members', 'username displayName avatarUrl');

        console.log(`Added ${validIds.length} members to group ${group.name}`);
        res.json({
            success: true,
            addedCount: validIds.length,
            members: group.members
        });
    } catch (error) {
        console.error('Add members error:', error);
        res.status(500).json({ message: 'Failed to add members', error: error.message });
    }
};

/**
 * Remove member from group
 * DELETE /api/groups/:id/members/:memberId
 */
export const removeMember = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, memberId } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        // Only admins can remove others, but anyone can remove themselves (leave)
        if (memberId !== userId && !group.isAdmin(userId)) {
            return res.status(403).json({ message: 'Only admins can remove members' });
        }

        // Creator cannot be removed
        if (group.isCreator(memberId)) {
            return res.status(400).json({ message: 'Cannot remove the group creator' });
        }

        group.members = group.members.filter(m => m.toString() !== memberId);
        group.admins = group.admins.filter(a => a.toString() !== memberId);
        await group.save();

        console.log(`Member ${memberId} removed from group ${group.name}`);
        res.json({ success: true, message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ message: 'Failed to remove member', error: error.message });
    }
};

/**
 * Leave group
 * POST /api/groups/:id/leave
 */
export const leaveGroup = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isMember(userId)) {
            return res.status(400).json({ message: 'You are not a member of this group' });
        }

        if (group.isCreator(userId)) {
            return res.status(400).json({
                message: 'Creator cannot leave the group. Transfer ownership or delete the group.'
            });
        }

        group.members = group.members.filter(m => m.toString() !== userId);
        group.admins = group.admins.filter(a => a.toString() !== userId);
        await group.save();

        console.log(`User ${userId} left group ${group.name}`);
        res.json({ success: true, message: 'You have left the group' });
    } catch (error) {
        console.error('Leave group error:', error);
        res.status(500).json({ message: 'Failed to leave group', error: error.message });
    }
};

/**
 * Get group messages
 * GET /api/groups/:id/messages
 */
export const getGroupMessages = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { limit = 50, before } = req.query;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isMember(userId)) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        let query = { groupId: id, deleted: false };
        if (before) {
            query.timestamp = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .populate('replyTo', 'senderId content type timestamp');

        // Get sender info for messages
        const senderIds = [...new Set(messages.map(m => m.senderId))];
        const users = await User.find({ _id: { $in: senderIds } });
        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = {
                id: u._id,
                username: u.username,
                displayName: u.displayName,
                avatarUrl: u.avatarUrl
            };
        });

        const enrichedMessages = messages.map(m => ({
            ...m.toObject(),
            sender: userMap[m.senderId] || { id: m.senderId, displayName: 'Unknown' }
        }));

        res.json({
            success: true,
            messages: enrichedMessages.reverse(),
            hasMore: messages.length === parseInt(limit)
        });
    } catch (error) {
        console.error('Get group messages error:', error);
        res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
    }
};

/**
 * Promote member to admin
 * POST /api/groups/:id/admins
 */
export const promoteToAdmin = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { memberId } = req.body;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isAdmin(userId)) {
            return res.status(403).json({ message: 'Only admins can promote members' });
        }

        if (!group.isMember(memberId)) {
            return res.status(400).json({ message: 'User is not a member of this group' });
        }

        if (group.isAdmin(memberId)) {
            return res.status(400).json({ message: 'User is already an admin' });
        }

        group.admins.push(memberId);
        await group.save();

        res.json({ success: true, message: 'Member promoted to admin' });
    } catch (error) {
        console.error('Promote admin error:', error);
        res.status(500).json({ message: 'Failed to promote member', error: error.message });
    }
};

/**
 * Demote admin to member
 * DELETE /api/groups/:id/admins/:adminId
 */
export const demoteAdmin = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, adminId } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        // Only creator can demote admins
        if (!group.isCreator(userId)) {
            return res.status(403).json({ message: 'Only the creator can demote admins' });
        }

        // Cannot demote the creator
        if (group.isCreator(adminId)) {
            return res.status(400).json({ message: 'Cannot demote the group creator' });
        }

        group.admins = group.admins.filter(a => a.toString() !== adminId);
        await group.save();

        res.json({ success: true, message: 'Admin demoted to member' });
    } catch (error) {
        console.error('Demote admin error:', error);
        res.status(500).json({ message: 'Failed to demote admin', error: error.message });
    }
};

/**
 * Join group via invite code
 * POST /api/groups/join/:inviteCode
 */
export const joinViaInvite = async (req, res) => {
    try {
        const userId = req.userId;
        const { inviteCode } = req.params;

        const group = await Group.findOne({ inviteCode });
        if (!group) {
            return res.status(404).json({ message: 'Invalid invite code' });
        }

        if (group.isMember(userId)) {
            return res.status(400).json({ message: 'You are already a member of this group' });
        }

        if (group.members.length >= Group.MAX_MEMBERS) {
            return res.status(400).json({ message: 'Group has reached maximum member limit' });
        }

        group.members.push(userId);
        await group.save();
        await group.populate('members', 'username displayName avatarUrl');

        console.log(`User ${userId} joined group ${group.name} via invite`);
        res.json({
            success: true,
            message: 'Joined group successfully',
            group: {
                id: group._id,
                name: group.name,
                memberCount: group.members.length
            }
        });
    } catch (error) {
        console.error('Join via invite error:', error);
        res.status(500).json({ message: 'Failed to join group', error: error.message });
    }
};

/**
 * Delete message in group (admin can delete any, member can delete own)
 * DELETE /api/groups/:id/messages/:messageId
 */
export const deleteGroupMessage = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, messageId } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isMember(userId)) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        const message = await Message.findOne({ _id: messageId, groupId: id });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Admins can delete any message, members can only delete their own
        if (message.senderId !== userId && !group.isAdmin(userId)) {
            return res.status(403).json({ message: 'You can only delete your own messages' });
        }

        message.deleted = true;
        await message.save();

        res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
        console.error('Delete group message error:', error);
        res.status(500).json({ message: 'Failed to delete message', error: error.message });
    }
};

/**
 * Pin/unpin a message in group (admin only)
 * POST /api/groups/:id/pin/:messageId
 */
export const pinMessage = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, messageId } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isAdmin(userId)) {
            return res.status(403).json({ message: 'Only admins can pin messages' });
        }

        const message = await Message.findOne({ _id: messageId, groupId: id, deleted: false });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        if (message.type !== 'text') {
            return res.status(400).json({ message: 'Only text messages can be pinned' });
        }

        const pinnedIndex = group.pinnedMessages.findIndex(
            p => p.toString() === messageId
        );

        if (pinnedIndex > -1) {
            // Unpin
            group.pinnedMessages.splice(pinnedIndex, 1);
            await group.save();
            res.json({ success: true, pinned: false, message: 'Message unpinned' });
        } else {
            // Pin (max 10 pinned messages)
            if (group.pinnedMessages.length >= 10) {
                return res.status(400).json({ message: 'Maximum 10 pinned messages allowed' });
            }
            group.pinnedMessages.push(messageId);
            await group.save();
            res.json({ success: true, pinned: true, message: 'Message pinned' });
        }
    } catch (error) {
        console.error('Pin message error:', error);
        res.status(500).json({ message: 'Failed to pin message', error: error.message });
    }
};

/**
 * Get pinned messages for group
 * GET /api/groups/:id/pinned
 */
export const getPinnedMessages = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isMember(userId)) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        if (!group.pinnedMessages || group.pinnedMessages.length === 0) {
            return res.json({ success: true, pinnedMessages: [] });
        }

        const messages = await Message.find({
            _id: { $in: group.pinnedMessages },
            deleted: false
        });

        // Get sender info
        const senderIds = [...new Set(messages.map(m => m.senderId))];
        const users = await User.find({ _id: { $in: senderIds } });
        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = {
                id: u._id,
                username: u.username,
                displayName: u.displayName,
                avatarUrl: u.avatarUrl
            };
        });

        const enriched = messages.map(m => ({
            ...m.toObject(),
            sender: userMap[m.senderId] || { id: m.senderId, displayName: 'Unknown' }
        }));

        res.json({ success: true, pinnedMessages: enriched });
    } catch (error) {
        console.error('Get pinned messages error:', error);
        res.status(500).json({ message: 'Failed to fetch pinned messages', error: error.message });
    }
};

/**
 * Search group messages
 * GET /api/groups/:id/messages/search?q=term
 */
export const searchGroupMessages = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({ message: 'Search query is required' });
        }

        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (!group.isMember(userId)) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        const messages = await Message.find({
            groupId: id,
            deleted: false,
            type: 'text',
            content: { $regex: q.trim(), $options: 'i' }
        })
            .sort({ timestamp: -1 })
            .limit(30);

        // Get sender info
        const senderIds = [...new Set(messages.map(m => m.senderId))];
        const users = await User.find({ _id: { $in: senderIds } });
        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = {
                id: u._id,
                username: u.username,
                displayName: u.displayName,
                avatarUrl: u.avatarUrl
            };
        });

        const enriched = messages.map(m => ({
            ...m.toObject(),
            sender: userMap[m.senderId] || { id: m.senderId, displayName: 'Unknown' }
        }));

        res.json({ success: true, messages: enriched, count: enriched.length });
    } catch (error) {
        console.error('Search group messages error:', error);
        res.status(500).json({ message: 'Failed to search messages', error: error.message });
    }
};
