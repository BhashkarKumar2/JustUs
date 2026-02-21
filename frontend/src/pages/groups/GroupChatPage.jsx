import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGroupSocket } from '../../hooks/useGroupSocket';
import { useGroupMessages } from '../../hooks/useGroupMessages';
import * as groupService from '../../services/groupService';
import GroupHeader from '../../components/groups/GroupHeader';
import GroupInfoModal from '../../components/modals/GroupInfoModal';
import Lightbox from '../../components/chat/layout/Lightbox';
import MentionPicker from '../../components/groups/MentionPicker'; // Still used for display names logic but picker is now inside logic
import './GroupChatPage.css';
import ComposeBar from '../../components/chat/input/ComposeBar';
import useImageUpload from '../../hooks/useImageUpload';
import useMessageSender from '../../hooks/useMessageSender'; // For sound effects/text logic if needed
import { getSocket } from '../../services/socket';
import { toast } from 'react-hot-toast';
import { getAuthenticatedMediaUrl } from '../../utils/mediaLoader';

/**
 * GroupChatPage - Main group chat interface
 */
const GroupChatPage = ({ user, groupId, onBack, theme = 'dark' }) => {
    const [group, setGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [inputState, setInputState] = useState('');
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [lightbox, setLightbox] = useState({ visible: false, url: null, type: null, filename: null });
    const [mentionState, setMentionState] = useState({ visible: false, filter: '', position: { bottom: '80px' } });

    // Pinned messages state
    const [pinnedMessages, setPinnedMessages] = useState([]);
    const [showPinnedBanner, setShowPinnedBanner] = useState(true);

    // Search state
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Context menu state (for pin/unpin)
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, messageId: null });

    // Reaction picker state
    const [reactionPicker, setReactionPicker] = useState({ visible: false, messageId: null });

    // Handle input change to detect mentions based on cursor position or text content
    const handleInputChange = (newText) => {
        setInputState(newText);

        // Check if the last word is a mention trigger
        // We can improve this by using cursor position if available, but for now simple text analysis
        // Find the last word being typed
        const words = newText.split(/(\s+)/); // Split by whitespace but keep delimiters to reconstruct if needed
        const lastWord = words[words.length - 1];

        if (lastWord && lastWord.startsWith('@')) {
            setMentionState({
                visible: true,
                filter: lastWord.substring(1), // Remove @
                position: { bottom: '80px' }
            });
        } else {
            if (mentionState.visible) {
                setMentionState(prev => ({ ...prev, visible: false }));
            }
        }
    };

    const handleMentionSelect = (user) => {
        // Replace the last @mention with the selected username
        const words = inputState.split(' ');
        words.pop(); // Remove the partial mention
        // Use username if available, fallback to displayName (sanitized)
        const mentionName = user.username || user.displayName.replace(/\s+/g, '');
        const newText = [...words, `@${mentionName} `].join(' ');

        setInputState(newText);
        setMentionState(prev => ({ ...prev, visible: false }));

        // Return focus to input (handled by ComposeBar effect usually, but good to note)
    };

    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null); // For debounced typing indicator

    // Socket hook for real-time messaging
    const {
        messages: socketMessages,
        typingUsers,
        sendMessage: socketSend,
        sendTyping,
        setMessages: setSocketMessages,
        sendRead,
        sendReaction,
        connectionStatus
    } = useGroupSocket(groupId, user);

    // Messages hook for initial load and pagination
    const {
        messages: loadedMessages,
        loading: messagesLoading,
        hasMore,
        loadMore,
        setMessages: setLoadedMessages
    } = useGroupMessages(groupId);

    // Sync real-time reaction & read updates into loadedMessages
    // (socket events update socketMessages, but most messages live in loadedMessages)
    useEffect(() => {
        const socket = getSocket();
        if (!socket || !groupId) return;

        const handleReacted = (data) => {
            if (data.groupId === groupId) {
                setLoadedMessages(prev => prev.map(m => {
                    const msgId = (m.id || m._id)?.toString();
                    if (msgId === data.messageId?.toString()) {
                        return { ...m, reactions: data.reactions };
                    }
                    return m;
                }));
            }
        };

        const handleRead = (data) => {
            if (data.groupId === groupId) {
                setLoadedMessages(prev => prev.map(m => {
                    const msgId = (m.id || m._id)?.toString();
                    if (data.messageIds.includes(msgId)) {
                        const currentReadBy = m.readBy || [];
                        if (currentReadBy.some(r => r.userId === data.userId)) return m;
                        return { ...m, readBy: [...currentReadBy, { userId: data.userId, readAt: data.readAt }] };
                    }
                    return m;
                }));
            }
        };

        socket.on('group.message_reacted', handleReacted);
        socket.on('group.message_read', handleRead);
        return () => {
            socket.off('group.message_reacted', handleReacted);
            socket.off('group.message_read', handleRead);
        };
    }, [groupId, setLoadedMessages]);

    // Combine loaded messages with socket messages
    const allMessages = [...loadedMessages];
    socketMessages.forEach(sm => {
        if (!allMessages.some(m => m.id === sm.id)) {
            allMessages.push(sm);
        }
    });

    // Wrapper for setMessages to support useImageUpload
    // We update socketMessages which are merged into view
    const setMessagesWrapper = useCallback((updater) => {
        setSocketMessages(prev => {
            if (typeof updater === 'function') return updater(prev);
            return updater;
        });
    }, [setSocketMessages]);

    // Image Upload Hook
    const { uploading, selectFile, uploadFile } = useImageUpload({
        userId: user.id,
        otherUserId: null, // Group chat
        conversationId: null, // Group chat
        groupId: groupId,
        setMessages: setMessagesWrapper
    });

    // Load group details
    useEffect(() => {
        if (!groupId) return;

        const loadGroup = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await groupService.getGroupById(groupId);
                setGroup(response.group);
            } catch (err) {
                console.error('Failed to load group:', err);
                const status = err.response?.status;
                if (status === 403) {
                    setError('You are not a member of this group.');
                } else if (status === 404) {
                    setError('Group not found.');
                } else {
                    setError('Failed to load group. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        loadGroup();
    }, [groupId]);

    // Load pinned messages
    useEffect(() => {
        if (!groupId) return;
        const loadPinned = async () => {
            try {
                const res = await groupService.getPinnedMessages(groupId);
                setPinnedMessages(res.pinnedMessages || []);
            } catch (err) {
                console.error('Failed to load pinned messages:', err);
            }
        };
        loadPinned();
    }, [groupId]);

    // Mark messages as read when viewing
    useEffect(() => {
        if (!allMessages.length || !user?.id) return;
        const unreadIds = allMessages
            .filter(m => m.senderId !== user.id && !(m.readBy || []).some(r => r.userId === user.id))
            .map(m => (m.id || m._id)?.toString())
            .filter(Boolean);
        if (unreadIds.length > 0) {
            sendRead(unreadIds);
        }
    }, [allMessages.length, user?.id, sendRead]);

    // Search handler
    useEffect(() => {
        if (!searchQuery.trim() || !groupId) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await groupService.searchGroupMessages(groupId, searchQuery);
                setSearchResults(res.messages || []);
            } catch (err) {
                console.error('Search failed:', err);
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery, groupId]);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => {
            setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
            setReactionPicker({ visible: false, messageId: null });
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // Pin/unpin message handler
    const handlePin = async (messageId) => {
        try {
            const res = await groupService.pinMessage(groupId, messageId);
            if (res.pinned) {
                const msg = allMessages.find(m => (m.id || m._id)?.toString() === messageId);
                if (msg) setPinnedMessages(prev => [...prev, msg]);
                toast.success('Message pinned');
            } else {
                setPinnedMessages(prev => prev.filter(p => (p.id || p._id)?.toString() !== messageId));
                toast.success('Message unpinned');
            }
        } catch (err) {
            toast.error('Failed to pin message');
        }
        setContextMenu({ visible: false, x: 0, y: 0, messageId: null });
    };

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [allMessages.length]);

    // Handle send message
    const handleSend = (e, contentOverride) => {
        e?.preventDefault();
        const content = contentOverride || inputState;
        if (!content.trim()) return;

        socketSend(content.trim());
        setInputState('');
    };

    // Handle typing
    const onTyping = () => {
        if (!typingTimeoutRef.current) {
            sendTyping();
            typingTimeoutRef.current = setTimeout(() => {
                typingTimeoutRef.current = null;
            }, 1000);
        }
    };

    // Format timestamp
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Check if message is from AI
    const isAIMessage = (message) => {
        return message.isBot || message.senderId === 'ai-assistant';
    };

    // Get sender display name
    const getSenderName = (message) => {
        if (isAIMessage(message)) return 'AI Assistant';
        if (message.senderId === user.id) return 'You';
        return message.senderDisplayName || 'Unknown';
    };

    // Render attachment preview
    const renderAttachment = (message) => {
        if (!message.type || message.type === 'text') return null;

        const isImage = message.type === 'image';
        const isVideo = message.type === 'video';
        const isDoc = message.type === 'document' || message.type === 'pdf';
        const isFile = message.type === 'file' || (!isImage && !isVideo && !isDoc);

        // Handle temp/local vs remote URLs
        // Note: For real chat attachments, usually the content IS the URL
        const getContentUrl = (url) => {
            if (!url) return '';
            // If it's a blob URL (local preview), use as is
            if (url.startsWith('blob:')) return url;
            // Otherwise, get authenticated URL
            return getAuthenticatedMediaUrl(url);
        };

        if (isImage) {
            return (
                <div className="message-attachment image">
                    <img
                        src={getContentUrl(message.content)}
                        alt="Attachment"
                        style={{ maxWidth: '200px', borderRadius: '8px', cursor: 'pointer' }}
                        onClick={() => setLightbox({
                            visible: true,
                            url: getContentUrl(message.content),
                            type: 'image',
                            filename: message.metadata?.filename
                        })}
                        onError={(e) => {
                            console.error('GroupChat image load error', {
                                src: e.target.src,
                                messageId: message.id,
                                type: message.type
                            });
                            e.target.style.display = 'none';
                        }}
                    />
                </div>
            );
        }
        if (isVideo) {
            return (
                <div className="message-attachment video">
                    <video
                        src={getContentUrl(message.content)}
                        controls
                        style={{ maxWidth: '200px', borderRadius: '8px', cursor: 'pointer' }}
                        onClick={(e) => {
                            e.preventDefault(); // Prevent default play if we want lightbox
                            setLightbox({
                                visible: true,
                                url: getContentUrl(message.content),
                                type: 'video',
                                filename: message.metadata?.filename
                            });
                        }}
                    />
                </div>
            );
        }
        if (isDoc || isFile) {
            const filename = message.metadata?.filename || '';
            const isPdf = filename.toLowerCase().endsWith('.pdf');
            return (
                <div className="message-attachment doc" style={{ marginTop: '4px' }}>
                    <a
                        href={getContentUrl(message.content)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 14px',
                            background: 'rgba(128, 128, 128, 0.15)',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            color: 'inherit',
                            border: '1px solid rgba(128, 128, 128, 0.2)',
                            minWidth: '200px',
                            maxWidth: '100%'
                        }}
                    >
                        {/* Icon Container */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            flexShrink: 0,
                            background: isPdf ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: isPdf ? '#ef4444' : '#3b82f6'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                        </div>

                        {/* File details */}
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {filename || 'Attached File'}
                            </span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '2px' }}>
                                {message.metadata?.size ? `${(message.metadata.size / 1024).toFixed(1)} KB` : 'Unknown size'} • {isPdf ? 'PDF' : 'File'}
                            </span>
                        </div>

                        {/* Download Icon */}
                        <div style={{ opacity: 0.6 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </div>
                    </a>
                </div>
            );
        }

        console.warn('RenderAttachment: UNKNOWN TYPE', message.type);
        return <div className="p-2 bg-red-100 text-red-500 text-xs rounded">Unknown: {message.type}</div>;
    };


    if (loading) {
        return (
            <div className="group-chat-page loading">
                <div className="loading-spinner">Loading group...</div>
            </div>
        );
    }

    if (error || !group) {
        return (
            <div className="group-chat-page error">
                <p>{error || 'Group not found'}</p>
                <button onClick={onBack} className="back-btn-error">← Go Back to Groups</button>
            </div>
        );
    }

    // Colors for ComposeBar
    const colors = {
        inputBg: theme === 'dark' ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.7)',
        inputBorder: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)',
        inputText: theme === 'dark' ? '#f3f4f6' : '#1f2937',
        primary: '#3b82f6' // Default primary
    };

    return (
        <div className="group-chat-page">
            <GroupHeader
                group={group}
                onBack={onBack}
                onInfoClick={() => setShowGroupInfo(true)}
                onSearchClick={() => setShowSearch(!showSearch)}
            />

            {/* Search Bar */}
            {showSearch && (
                <div className="group-search-bar" style={{ padding: '8px 16px', background: theme === 'dark' ? '#1f2937' : '#f3f4f6', borderBottom: '1px solid rgba(128,128,128,0.2)' }}>
                    <input
                        type="text"
                        placeholder="Search messages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(128,128,128,0.3)', background: theme === 'dark' ? '#374151' : '#fff', color: theme === 'dark' ? '#fff' : '#000', outline: 'none' }}
                    />
                    {searching && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>Searching...</div>}
                    {searchResults.length > 0 && (
                        <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                            {searchResults.map(r => (
                                <div
                                    key={r._id}
                                    onClick={() => {
                                        const el = document.getElementById(`msg-${r._id}`);
                                        if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            el.style.transition = 'background 0.3s';
                                            el.style.background = 'rgba(59,130,246,0.15)';
                                            setTimeout(() => { el.style.background = ''; }, 1500);
                                        }
                                    }}
                                    style={{ padding: '6px 8px', fontSize: '0.8rem', borderBottom: '1px solid rgba(128,128,128,0.1)', cursor: 'pointer', color: theme === 'dark' ? '#e5e7eb' : '#374151' }}
                                >
                                    <strong>{r.sender?.displayName || 'Unknown'}</strong>: {r.content?.substring(0, 80)}{r.content?.length > 80 ? '...' : ''}
                                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginLeft: '8px' }}>{formatTime(r.timestamp)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Pinned Messages Banner */}
            {pinnedMessages.length > 0 && showPinnedBanner && (
                <div
                    className="pinned-banner"
                    onClick={() => {
                        const pin = pinnedMessages[pinnedMessages.length - 1];
                        const pinId = (pin.id || pin._id)?.toString();
                        const el = document.getElementById(`msg-${pinId}`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.transition = 'background 0.3s';
                            el.style.background = 'rgba(59,130,246,0.15)';
                            setTimeout(() => { el.style.background = ''; }, 1500);
                        }
                    }}
                    style={{ padding: '8px 16px', background: theme === 'dark' ? '#1e3a5f' : '#eff6ff', borderBottom: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L12 22" /><path d="M5 12H19" /><circle cx="12" cy="8" r="4" /></svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme === 'dark' ? '#93c5fd' : '#2563eb' }}>
                            Pinned: {pinnedMessages[pinnedMessages.length - 1]?.content?.substring(0, 60) || 'Message'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>({pinnedMessages.length})</span>
                    </div>
                    <button onClick={() => setShowPinnedBanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem' }}>X</button>
                </div>
            )}

            <div className="messages-container">
                {hasMore && (
                    <button className="load-more-btn" onClick={loadMore} disabled={messagesLoading}>
                        {messagesLoading ? 'Loading...' : 'Load older messages'}
                    </button>
                )}

                {allMessages.map((message, index) => {
                    const msgId = (message.id || message._id)?.toString();
                    const isOwn = message.senderId === user.id;
                    const isPinned = pinnedMessages.some(p => (p.id || p._id)?.toString() === msgId);
                    const readCount = (message.readBy || []).length;

                    return (
                        <div
                            key={msgId || index}
                            id={msgId ? `msg-${msgId}` : undefined}
                            className={`message-bubble ${isOwn ? 'sent' : 'received'} ${isAIMessage(message) ? 'ai-message' : ''} ${message.deleted ? 'deleted' : ''}`}
                            onContextMenu={(e) => {
                                if ((group?.isAdmin || group?.isCreator) && message.type === 'text' && !message.deleted) {
                                    e.preventDefault();
                                    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, messageId: msgId });
                                }
                            }}
                        >
                            {isPinned && <div style={{ fontSize: '0.65rem', color: '#3b82f6', marginBottom: '2px' }}>Pinned</div>}
                            {/* Hide 'You' for own messages */}
                            {!isOwn && (
                                <div className="message-sender" style={{ fontSize: '0.75rem', marginBottom: '2px', opacity: 0.8 }}>
                                    {getSenderName(message)}
                                </div>
                            )}
                            <div className="message-content" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    {message.deleted
                                        ? <span style={{ fontStyle: 'italic', opacity: 0.7 }}>This message was deleted</span>
                                        : (
                                            <>
                                                {message.type !== 'text' && renderAttachment(message)}
                                                {message.content && (message.type === 'text' || message.metadata?.caption) && (
                                                    <div className="message-text">
                                                        {(() => {
                                                            const text = message.type === 'text' ? message.content : (message.metadata?.caption || '');
                                                            const parts = text.split(/(@\w+)/g);
                                                            return parts.map((part, i) =>
                                                                part.startsWith('@') ? (
                                                                    <span key={i} style={{ color: '#ffffff', fontWeight: 600, textShadow: '0 0 1px rgba(0,0,0,0.3)' }}>{part}</span>
                                                                ) : part
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </>
                                        )
                                    }
                                </div>
                                {/* Compact Timestamp */}
                                <div className="message-time" style={{ fontSize: '0.65rem', opacity: 0.6, whiteSpace: 'nowrap', marginTop: 'auto', paddingBottom: '2px' }}>
                                    {formatTime(message.timestamp)}
                                    {isOwn && readCount > 0 && (
                                        <span style={{ marginLeft: '4px', color: '#22c55e' }}>✓ {readCount}</span>
                                    )}
                                </div>
                            </div>

                            {/* Reactions display */}
                            {!message.deleted && (message.reactions || []).length > 0 && (() => {
                                // Group reactions by emoji
                                const grouped = {};
                                (message.reactions || []).forEach(r => {
                                    if (!grouped[r.emoji]) grouped[r.emoji] = [];
                                    grouped[r.emoji].push(r.userId);
                                });
                                return (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                        {Object.entries(grouped).map(([emoji, userIds]) => (
                                            <button
                                                key={emoji}
                                                onClick={() => sendReaction(msgId, emoji)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                    padding: '2px 6px', borderRadius: '12px', border: 'none',
                                                    background: userIds.includes(user.id) ? 'rgba(59,130,246,0.2)' : 'rgba(128,128,128,0.15)',
                                                    cursor: 'pointer', fontSize: '0.8rem', color: 'inherit',
                                                    outline: userIds.includes(user.id) ? '1px solid rgba(59,130,246,0.5)' : 'none'
                                                }}
                                            >
                                                <span>{emoji}</span>
                                                <span style={{ fontSize: '0.7rem' }}>{userIds.length}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Reaction add button (Hover only) */}
                            {!message.deleted && (
                                <div style={{ position: 'relative' }}>
                                    <button
                                        className="reaction-trigger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setReactionPicker(prev => prev.messageId === msgId && prev.visible ? { visible: false, messageId: null } : { visible: true, messageId: msgId });
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', opacity: 0, padding: '0 4px', transition: 'opacity 0.2s', position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isOwn ? 'left' : 'right']: '-24px' }}
                                    >
                                        +
                                    </button>
                                    {reactionPicker.visible && reactionPicker.messageId === msgId && (
                                        <div
                                            style={{
                                                position: 'absolute', bottom: '100%', [isOwn ? 'right' : 'left']: 0,
                                                background: theme === 'dark' ? '#374151' : '#fff',
                                                border: '1px solid rgba(128,128,128,0.3)', borderRadius: '12px',
                                                padding: '4px 6px', display: 'flex', gap: '2px',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
                                                marginBottom: '4px'
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'].map(emoji => (
                                                <button
                                                    key={emoji}
                                                    onClick={() => {
                                                        sendReaction(msgId, emoji);
                                                        setReactionPicker({ visible: false, messageId: null });
                                                    }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px', borderRadius: '6px', transition: 'transform 0.15s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    );
                })}

                {typingUsers.length > 0 && (
                    <div className="typing-indicator">
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Mention Picker */}
            {mentionState.visible && group && (
                <MentionPicker
                    members={group.members || []}
                    filterText={mentionState.filter}
                    onSelect={handleMentionSelect}
                    onClose={() => setMentionState(prev => ({ ...prev, visible: false }))}
                    position={mentionState.position}
                />
            )}

            <ComposeBar
                text={inputState}
                setText={handleInputChange}
                onTyping={onTyping}
                // Group specific props
                uploading={uploading}
                selectFile={selectFile}
                uploadFile={uploadFile}
                send={handleSend}
                // Extras
                colors={colors}
                theme={theme}
                currentUserId={user.id}
                connectionStatus={connectionStatus}
                // Map group to otherUser for ComposeBar compatibility
                otherUser={group ? { ...group, displayName: group.name } : null}
                // Disable unsupported features
                recording={false} // Todo: enable voice messages for groups
                replyingTo={null}
            />

            {showGroupInfo && (
                <GroupInfoModal
                    group={group}
                    user={user}
                    onClose={() => setShowGroupInfo(false)}
                    onGroupUpdated={setGroup}
                />
            )}

            {lightbox.visible && (
                <Lightbox
                    url={lightbox.url}
                    type={lightbox.type}
                    filename={lightbox.filename}
                    onClose={() => setLightbox({ visible: false, url: null, type: null, filename: null })}
                />
            )}

            {/* Context Menu for Pin/Unpin */}
            {contextMenu.visible && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: theme === 'dark' ? '#374151' : '#fff',
                        border: '1px solid rgba(128,128,128,0.3)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        padding: '4px 0'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => handlePin(contextMenu.messageId)}
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: theme === 'dark' ? '#e5e7eb' : '#374151',
                            fontSize: '0.85rem'
                        }}
                    >
                        {pinnedMessages.some(p => (p.id || p._id)?.toString() === contextMenu.messageId) ? 'Unpin Message' : 'Pin Message'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default GroupChatPage;
