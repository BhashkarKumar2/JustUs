import React, { useState, useEffect, useRef } from 'react';
import './MentionPicker.css';
import Avatar from '../common/Avatar';

/**
 * MentionPicker - Dropdown for selecting @mentions
 * Appears when user types "@" and filters as they type
 */
const MentionPicker = ({ members, onSelect, onClose, filterText, position }) => {
    const pickerRef = useRef(null);

    // Filter members based on typed text
    const filteredMembers = members.filter(member => {
        const searchText = filterText.toLowerCase();
        const name = (member.displayName || member.username || '').toLowerCase();
        return name.includes(searchText);
    });

    // Add AI assistant option at the top
    const options = [
        { id: 'ai', displayName: 'AI Assistant', username: 'AI', isAI: true },
        ...filteredMembers
    ].filter(opt => {
        if (opt.isAI) {
            return 'ai assistant'.includes(filterText.toLowerCase()) ||
                'ai'.includes(filterText.toLowerCase());
        }
        return true;
    });

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Handle keyboard navigation
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (options[selectedIndex]) {
                    onSelect(options[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [options, selectedIndex, onSelect, onClose]);

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [filterText]);

    if (options.length === 0) {
        return null;
    }

    return (
        <div
            ref={pickerRef}
            className="mention-picker"
            style={{ bottom: position?.bottom || '60px' }}
        >
            <div className="mention-picker-header">
                Mention someone
            </div>
            <div className="mention-picker-list">
                {options.map((option, index) => (
                    <div
                        key={option.id || option._id}
                        className={`mention-picker-item ${index === selectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelect(option)}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        {option.isAI ? (
                            <>
                                <div className="mention-avatar ai-avatar">🤖</div>
                                <div className="mention-info">
                                    <div className="mention-name">AI Assistant</div>
                                    <div className="mention-hint">Get AI help in the group</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="mention-avatar">
                                    <Avatar user={option} size={36} />
                                </div>
                                <div className="mention-info">
                                    <div className="mention-name">{option.displayName || option.username}</div>
                                    {option.displayName && option.username && (
                                        <div className="mention-username">@{option.username}</div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MentionPicker;
