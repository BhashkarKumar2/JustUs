import React, { useState, useRef, useEffect } from 'react';
import { getSocket } from '../../services/socket';
import { toast } from 'react-hot-toast';
import { getAuthenticatedApi } from '../../services/api';
import { getAuthenticatedMediaUrl } from '../../utils/mediaLoader';
import * as groupService from '../../services/groupService';
import './GroupInfoModal.css';

/**
 * GroupInfoModal - Modal showing group details and member management
 */
const GroupInfoModal = ({ group, user, onClose, onGroupUpdated }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [showInviteCode, setShowInviteCode] = useState(false);
    const fileInputRef = useRef(null);

    // Description edit state
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState(group?.description || '');

    // Online members tracking
    const [onlineMembers, setOnlineMembers] = useState(new Set());

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const handleStatus = (data) => {
            setOnlineMembers(prev => {
                const next = new Set(prev);
                if (data.status === 'online') {
                    next.add(data.userId);
                } else {
                    next.delete(data.userId);
                }
                return next;
            });
        };

        socket.on('user:status', handleStatus);
        // Current user is always online
        if (user?.id) setOnlineMembers(prev => new Set(prev).add(user.id));

        return () => socket.off('user:status', handleStatus);
    }, [user?.id]);

    // Debug logging
    console.log('[GroupInfoModal] Rendering for group:', group ? { id: group.id || group._id, name: group.name, avatarUrl: group.avatarUrl } : 'null');
    if (group?.avatarUrl) {
        console.log('[GroupInfoModal] Authenticated Avatar URL:', getAuthenticatedMediaUrl(group.avatarUrl));
    }

    if (!group) return null;

    // Safe ID access
    const groupId = group.id || group._id;
    if (!groupId) {
        console.error('GroupInfoModal: Invalid group object', group);
        return null; // Or show error
    }

    const isAdmin = group.isAdmin || group.admins?.some(a =>
        (a._id || a) === user?.id || (a._id || a).toString() === user?.id
    );
    const isCreator = group.isCreator || group.creator?._id === user?.id || group.creator === user?.id;

    const handleLeaveGroup = async () => {
        if (!window.confirm('Are you sure you want to leave this group?')) return;

        setLoading(true);
        try {
            await groupService.leaveGroup(groupId);
            onClose();
            // Optionally trigger a refresh of the group list
            window.location.reload();
        } catch (err) {
            setError(err.message || 'Failed to leave group');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGroup = async () => {
        if (!window.confirm('Are you sure you want to delete this group? This cannot be undone.')) return;

        setLoading(true);
        try {
            await groupService.deleteGroup(groupId);
            onClose();
            window.location.reload();
        } catch (err) {
            setError(err.message || 'Failed to delete group');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!window.confirm('Remove this member from the group?')) return;

        try {
            await groupService.removeMember(groupId, memberId);
            onGroupUpdated({
                ...group,
                members: group.members.filter(m => (m._id || m) !== memberId)
            });
        } catch (err) {
            setError(err.message || 'Failed to remove member');
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be smaller than 5MB');
            return;
        }

        handleAvatarUpload(file);
    };

    const handleAvatarUpload = async (file) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('groupId', groupId); // Associate with group - MUST BE BEFORE FILE
            formData.append('file', file);

            const api = getAuthenticatedApi();
            const uploadRes = await api.post('/api/media/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const newAvatarUrl = `/api/media/file/${uploadRes.data.id}`;

            // Update group with new avatar
            const updatedGroup = await groupService.updateGroup(groupId, { avatarUrl: newAvatarUrl });

            onGroupUpdated(updatedGroup.group || updatedGroup);
            toast.success('Group icon updated!');
        } catch (err) {
            console.error('Failed to upload group avatar:', err);
            toast.error('Failed to update group icon');
        } finally {
            setUploading(false);
            // Clear input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handlePromoteAdmin = async (memberId) => {
        try {
            await groupService.promoteToAdmin(groupId, memberId);
            onGroupUpdated({
                ...group,
                admins: [...(group.admins || []), memberId]
            });
        } catch (err) {
            setError(err.message || 'Failed to promote member');
        }
    };

    // Demote admin handler
    const handleDemoteAdmin = async (adminId) => {
        if (!window.confirm('Demote this admin to a regular member?')) return;
        try {
            await groupService.demoteAdmin(groupId, adminId);
            onGroupUpdated({
                ...group,
                admins: (group.admins || []).filter(a => (a._id || a) !== adminId)
            });
            toast.success('Admin demoted');
        } catch (err) {
            setError(err.message || 'Failed to demote admin');
        }
    };

    // Save description handler
    const handleSaveDescription = async () => {
        try {
            await groupService.updateGroup(groupId, { description: descValue.trim() });
            onGroupUpdated({ ...group, description: descValue.trim() });
            setEditingDesc(false);
            toast.success('Description updated');
        } catch (err) {
            setError(err.message || 'Failed to update description');
        }
    };

    const copyInviteCode = () => {
        if (group.inviteCode) {
            navigator.clipboard.writeText(group.inviteCode);
            alert('Invite code copied to clipboard!');
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="group-info-modal-backdrop" onClick={handleBackdropClick}>
            <div className="group-info-modal">
                <div className="modal-header">
                    <h2>Group Info</h2>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="modal-content">
                    {/* Group Info Section */}
                    <div className="group-profile">
                        <div className="group-avatar-large" style={{ position: 'relative' }}>
                            {group.avatarUrl ? (
                                <img
                                    src={getAuthenticatedMediaUrl(group.avatarUrl)}
                                    alt={group.name}
                                    onError={(e) => {
                                        console.error('Avatar load error:', e);
                                        console.log('Failed URL was:', getAuthenticatedMediaUrl(group.avatarUrl));
                                    }}
                                />
                            ) : (
                                <div className="avatar-placeholder">
                                    {group.name.charAt(0).toUpperCase()}
                                </div>
                            )}

                            {isAdmin && (
                                <>
                                    <button
                                        className="avatar-edit-overlay"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        title="Change Group Icon"
                                    >
                                        {uploading ? '...' : 'Edit'}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                        style={{ display: 'none' }}
                                    />
                                </>
                            )}
                        </div>
                        <h3>{group.name}</h3>

                        {/* Editable Description */}
                        {editingDesc ? (
                            <div style={{ margin: '8px 0' }}>
                                <textarea
                                    value={descValue}
                                    onChange={(e) => setDescValue(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.3)', background: 'rgba(255,255,255,0.05)', color: 'inherit', resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <button onClick={handleSaveDescription} style={{ padding: '4px 12px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                                    <button onClick={() => { setEditingDesc(false); setDescValue(group.description || ''); }} style={{ padding: '4px 12px', borderRadius: '4px', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '4px 0', width: '100%' }}>
                                {group.description ? (
                                    <p className="group-description" style={{ margin: 0, textAlign: 'center' }}>{group.description}</p>
                                ) : (
                                    <p className="group-description" style={{ color: '#9ca3af', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No description</p>
                                )}
                                {isAdmin && (
                                    <button onClick={() => setEditingDesc(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.75rem', padding: 0 }}>Edit</button>
                                )}
                            </div>
                        )}

                        <div className="group-stats">
                            <span>{group.members?.length || group.memberCount} members</span>
                            <span style={{ color: '#22c55e' }}>{onlineMembers.size} online</span>
                            <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>

                    {/* Invite Code Section (Admin only) */}
                    {isAdmin && group.inviteCode && (
                        <div className="section">
                            <h4>Invite Code</h4>
                            <div className="invite-code-section">
                                {showInviteCode ? (
                                    <div className="invite-code">
                                        <code>{group.inviteCode}</code>
                                        <button onClick={copyInviteCode}>Copy</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowInviteCode(true)}>Show Invite Code</button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Members Section */}
                    <div className="section">
                        <h4>Members ({group.members?.length || 0})</h4>
                        <div className="members-list">
                            {(group.members || []).map(member => {
                                const memberId = member._id || member;
                                const memberIsAdmin = group.admins?.some(a => (a._id || a) === memberId);
                                const memberIsCreator = (group.creator?._id || group.creator) === memberId;

                                return (
                                    <div key={memberId} className="member-item">
                                        <div className="member-avatar" style={{ position: 'relative' }}>
                                            {member.avatarUrl ? (
                                                <img src={member.avatarUrl} alt={member.displayName} />
                                            ) : (
                                                <div className="avatar-placeholder">
                                                    {(member.displayName || member.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            {onlineMembers.has(memberId) && (
                                                <div style={{ position: 'absolute', bottom: '0', right: '0', width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', border: '2px solid var(--modal-bg, #1f2937)' }} />
                                            )}
                                        </div>
                                        <div className="member-info">
                                            <div className="member-name">
                                                {member.displayName || member.username}
                                                {memberIsCreator && <span className="badge creator">Creator</span>}
                                                {memberIsAdmin && !memberIsCreator && <span className="badge admin">Admin</span>}
                                                {memberId === user?.id && <span className="badge you">You</span>}
                                            </div>
                                            <div className="member-username">@{member.username}</div>
                                        </div>
                                        {isAdmin && memberId !== user?.id && !memberIsCreator && (
                                            <div className="member-actions">
                                                {!memberIsAdmin && (
                                                    <button onClick={() => handlePromoteAdmin(memberId)} title="Make Admin">
                                                        Admin
                                                    </button>
                                                )}
                                                {memberIsAdmin && isCreator && (
                                                    <button onClick={() => handleDemoteAdmin(memberId)} title="Demote" style={{ color: '#f59e0b' }}>
                                                        Demote
                                                    </button>
                                                )}
                                                <button onClick={() => handleRemoveMember(memberId)} title="Remove">
                                                    Remove
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    {/* Actions Section */}
                    <div className="modal-actions">
                        {!isCreator && (
                            <button
                                className="btn-danger"
                                onClick={handleLeaveGroup}
                                disabled={loading}
                            >
                                Leave Group
                            </button>
                        )}
                        {isCreator && (
                            <button
                                className="btn-danger"
                                onClick={handleDeleteGroup}
                                disabled={loading}
                            >
                                Delete Group
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupInfoModal;
