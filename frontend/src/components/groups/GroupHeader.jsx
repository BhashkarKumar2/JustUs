import React from 'react';
import './GroupHeader.css';

/**
 * GroupHeader - Header for group chat page
 */
const GroupHeader = ({ group, onBack, onInfoClick }) => {
    if (!group) return null;

    return (
        <div className="group-header">
            <button className="back-btn" onClick={onBack}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15,18 9,12 15,6" />
                </svg>
            </button>

            <div className="group-header-info" onClick={onInfoClick}>
                <div className="group-header-avatar">
                    {group.avatarUrl ? (
                        <img src={group.avatarUrl} alt={group.name} />
                    ) : (
                        <div className="avatar-placeholder">
                            {group.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="group-header-details">
                    <div className="group-header-name">{group.name}</div>
                    <div className="group-header-members">
                        {group.memberCount || group.members?.length || 0} members
                        {group.settings?.aiEnabled !== false && (
                            <span className="ai-badge">🤖 AI enabled</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="group-header-actions">
                <button className="info-btn" onClick={onInfoClick}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default GroupHeader;
