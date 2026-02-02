import api from './api';

/**
 * Group Service - API calls for group management
 * Uses the shared api instance which has the correct baseURL and auth handling
 */

/**
 * Create a new group
 */
export const createGroup = async (name, description = '', memberIds = [], avatarUrl = null) => {
    const response = await api.post('/api/groups', { name, description, memberIds, avatarUrl });
    return response.data;
};

/**
 * Get all groups for current user
 */
export const getGroups = async () => {
    const response = await api.get('/api/groups');
    return response.data;
};

/**
 * Get single group by ID
 */
export const getGroupById = async (groupId) => {
    const response = await api.get(`/api/groups/${groupId}`);
    return response.data;
};

/**
 * Update group info
 */
export const updateGroup = async (groupId, updates) => {
    const response = await api.put(`/api/groups/${groupId}`, updates);
    return response.data;
};

/**
 * Delete group (creator only)
 */
export const deleteGroup = async (groupId) => {
    const response = await api.delete(`/api/groups/${groupId}`);
    return response.data;
};

/**
 * Add members to group
 */
export const addMembers = async (groupId, memberIds) => {
    const response = await api.post(`/api/groups/${groupId}/members`, { memberIds });
    return response.data;
};

/**
 * Remove member from group
 */
export const removeMember = async (groupId, memberId) => {
    const response = await api.delete(`/api/groups/${groupId}/members/${memberId}`);
    return response.data;
};

/**
 * Leave group
 */
export const leaveGroup = async (groupId) => {
    const response = await api.post(`/api/groups/${groupId}/leave`, {});
    return response.data;
};

/**
 * Get group messages
 */
export const getGroupMessages = async (groupId, limit = 50, before = null) => {
    const params = { limit };
    if (before) params.before = before;

    const response = await api.get(`/api/groups/${groupId}/messages`, { params });
    return response.data;
};

/**
 * Delete a group message
 */
export const deleteGroupMessage = async (groupId, messageId) => {
    const response = await api.delete(`/api/groups/${groupId}/messages/${messageId}`);
    return response.data;
};

/**
 * Promote member to admin
 */
export const promoteToAdmin = async (groupId, memberId) => {
    const response = await api.post(`/api/groups/${groupId}/admins`, { memberId });
    return response.data;
};

/**
 * Demote admin to member
 */
export const demoteAdmin = async (groupId, adminId) => {
    const response = await api.delete(`/api/groups/${groupId}/admins/${adminId}`);
    return response.data;
};

/**
 * Join group via invite code
 */
export const joinViaInvite = async (inviteCode) => {
    const response = await api.post(`/api/groups/join/${inviteCode}`, {});
    return response.data;
};

export default {
    createGroup,
    getGroups,
    getGroupById,
    updateGroup,
    deleteGroup,
    addMembers,
    removeMember,
    leaveGroup,
    getGroupMessages,
    deleteGroupMessage,
    promoteToAdmin,
    demoteAdmin,
    joinViaInvite
};
