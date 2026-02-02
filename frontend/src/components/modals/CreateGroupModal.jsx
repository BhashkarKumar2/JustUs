import React, { useState } from 'react';
import './CreateGroupModal.css';

/**
 * CreateGroupModal - Modal for creating a new group
 */
const CreateGroupModal = ({ show, onClose, onCreateGroup, contacts }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!show) return null;

    const filteredContacts = (contacts || []).filter(contact =>
        contact.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleMember = (contactId) => {
        setSelectedMembers(prev =>
            prev.includes(contactId)
                ? prev.filter(id => id !== contactId)
                : [...prev, contactId]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Group name is required');
            return;
        }

        if (selectedMembers.length === 0) {
            setError('Select at least one member');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onCreateGroup({
                name: name.trim(),
                description: description.trim(),
                memberIds: selectedMembers
            });

            // Reset form
            setName('');
            setDescription('');
            setSelectedMembers([]);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create group');
        } finally {
            setLoading(false);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="create-group-modal-backdrop" onClick={handleBackdropClick}>
            <div className="create-group-modal">
                <div className="modal-header">
                    <h2>Create New Group</h2>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Group Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter group name"
                            maxLength={100}
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label>Description (optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What's this group about?"
                            maxLength={500}
                            rows={3}
                        />
                    </div>

                    <div className="form-group">
                        <label>Add Members ({selectedMembers.length} selected)</label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search contacts..."
                            className="search-input"
                        />

                        <div className="members-list">
                            {filteredContacts.length === 0 ? (
                                <div className="no-contacts">No contacts found</div>
                            ) : (
                                filteredContacts.map(contact => (
                                    <div
                                        key={contact.id || contact._id}
                                        className={`member-item ${selectedMembers.includes(contact.id || contact._id) ? 'selected' : ''}`}
                                        onClick={() => toggleMember(contact.id || contact._id)}
                                    >
                                        <div className="member-avatar">
                                            {contact.avatarUrl ? (
                                                <img src={contact.avatarUrl} alt={contact.displayName} />
                                            ) : (
                                                <div className="avatar-placeholder">
                                                    {(contact.displayName || contact.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="member-info">
                                            <div className="member-name">{contact.displayName || contact.username}</div>
                                            <div className="member-username">@{contact.username}</div>
                                        </div>
                                        <div className="member-checkbox">
                                            {selectedMembers.includes(contact.id || contact._id) && (
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                    <polyline points="20,6 9,17 4,12" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-create" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateGroupModal;
