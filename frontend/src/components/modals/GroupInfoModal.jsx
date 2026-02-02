import React, { useState } from 'react';
import * as groupService from '../../services/groupService';
import './GroupInfoModal.css';

/**
 * GroupInfoModal - Modal showing group details and member management
 */
const GroupInfoModal = ({ group, user, onClose, onGroupUpdated }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showInviteCode, setShowInviteCode] = useState(false);

    if (!group) return null;

    const isAdmin = group.isAdmin || group.admins?.some(a =>
        (a._id || a) === user?.id || (a._id || a).toString() === user?.id
    );
    const isCreator = group.isCreator || group.creator?._id === user?.id || group.creator === user?.id;

    const handleLeaveGroup = async () => {
        if (!window.confirm('Are you sure you want to leave this group?')) return;

        setLoading(true);
        try {
            await groupService.leaveGroup(group.id);
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
            await groupService.deleteGroup(group.id);
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
            await groupService.removeMember(group.id, memberId);
            onGroupUpdated({
                ...group,
                members: group.members.filter(m => (m._id || m) !== memberId)
            });
        } catch (err) {
            setError(err.message || 'Failed to remove member');
        }
    };

    const handlePromoteAdmin = async (memberId) => {
        try {
            await groupService.promoteToAdmin(group.id, memberId);
            onGroupUpdated({
                ...group,
                admins: [...(group.admins || []), memberId]
            });
        } catch (err) {
            setError(err.message || 'Failed to promote member');
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
                        <div className="group-avatar-large">
                            {group.avatarUrl ? (
                                <img src={group.avatarUrl} alt={group.name} />
                            ) : (
                                <div className="avatar-placeholder">
                                    {group.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h3>{group.name}</h3>
                        {group.description && <p className="group-description">{group.description}</p>}
                        <div className="group-stats">
                            <span>{group.members?.length || group.memberCount} members</span>
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
                                        <div className="member-avatar">
                                            {member.avatarUrl ? (
                                                <img src={member.avatarUrl} alt={member.displayName} />
                                            ) : (
                                                <div className="avatar-placeholder">
                                                    {(member.displayName || member.username || '?').charAt(0).toUpperCase()}
                                                </div>
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
                                                        👑
                                                    </button>
                                                )}
                                                <button onClick={() => handleRemoveMember(memberId)} title="Remove">
                                                    ❌
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
