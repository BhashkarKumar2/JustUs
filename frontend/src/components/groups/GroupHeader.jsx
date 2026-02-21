import React from 'react';
import './GroupHeader.css';
import { getAuthenticatedMediaUrl } from '../../utils/mediaLoader';

/**
 * GroupHeader - Header for group chat page
 */
const GroupHeader = ({ group, onBack, onInfoClick, onSearchClick }) => {
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
                        <img
                            src={getAuthenticatedMediaUrl(group.avatarUrl)}
                            alt={group.name}
                            onError={(e) => console.error('[GroupHeader] Avatar load error', e)}
                        />
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
                            <span className="ai-badge">AI enabled</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="group-header-actions">
                {onSearchClick && (
                    <button className="search-btn" onClick={onSearchClick} title="Search messages">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </button>
                )}
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
