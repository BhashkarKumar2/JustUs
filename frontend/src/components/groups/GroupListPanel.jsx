import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as groupService from '../../services/groupService';
import { getAuthenticatedMediaUrl } from '../../utils/mediaLoader';
import './GroupListPanel.css';

/**
 * GroupListPanel - Displays list of user's groups
 */
const GroupListPanel = ({ user, onSelectGroup, selectedGroupId, onCreateGroup }) => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const loadGroups = async () => {
            try {
                setLoading(true);
                console.log('[GroupListPanel] Calling getGroups API...');
                const response = await groupService.getGroups();
                console.log('[GroupListPanel] API Response:', response);
                console.log('[GroupListPanel] Groups received:', response.groups?.map(g => ({ id: g.id, name: g.name })));
                setGroups(response.groups || []);
            } catch (err) {
                console.error('[GroupListPanel] Failed to load groups:', err);
                console.error('[GroupListPanel] Error details:', err.response?.data);
                setError('Failed to load groups');
            } finally {
                setLoading(false);
            }
        };

        console.log('[GroupListPanel] Component mounted, loading groups...');
        loadGroups();
    }, []);

    // Filter groups based on search query
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        const query = searchQuery.toLowerCase();
        return groups.filter(group =>
            group.name.toLowerCase().includes(query)
        );
    }, [groups, searchQuery]);

    const handleSelectGroup = (group) => {
        console.log('[GroupListPanel] Group selected:', { id: group.id, name: group.name });
        onSelectGroup(group);
    };

    const formatLastMessage = (group) => {
        if (!group.lastMessageAt) return 'No messages yet';
        const date = new Date(group.lastMessageAt);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="group-list-panel">
                <div className="group-list-header">
                    <h3>Groups</h3>
                </div>
                <div className="group-list-loading">Loading groups...</div>
            </div>
        );
    }

    return (
        <div className="group-list-panel">
            <div className="group-list-header">
                <h3>Groups</h3>
                <button className="create-group-btn" onClick={onCreateGroup}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* Search Bar */}
            {groups.length > 0 && (
                <div className="group-search-wrapper">
                    <input
                        type="text"
                        className="group-search-input"
                        placeholder="Search groups..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {error && <div className="group-list-error">{error}</div>}

            <div className="group-list">
                {groups.length === 0 ? (
                    <div className="group-list-empty">
                        <p>No groups yet</p>
                        <button onClick={onCreateGroup}>Create your first group</button>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div className="group-list-empty">
                        <p>No groups found matching &quot;{searchQuery}&quot;</p>
                    </div>
                ) : (
                    filteredGroups.map(group => (
                        <div
                            key={group.id}
                            className={`group-list-item ${selectedGroupId === group.id ? 'selected' : ''}`}
                            onClick={() => handleSelectGroup(group)}
                        >
                            <div className="group-avatar">
                                {group.avatarUrl ? (
                                    <img
                                        src={getAuthenticatedMediaUrl(group.avatarUrl)}
                                        alt={group.name}
                                        onError={(e) => console.error('[GroupListPanel] Avatar load error for', group.name, e)}
                                    />
                                ) : (
                                    <div className="group-avatar-placeholder">
                                        {group.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="group-info">
                                <div className="group-name">{group.name}</div>
                                <div className="group-preview">
                                    {group.lastMessagePreview || 'No messages yet'}
                                </div>
                            </div>
                            <div className="group-meta">
                                <div className="group-time">{formatLastMessage(group)}</div>
                                <div className="group-member-count">{group.memberCount} members</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default GroupListPanel;

