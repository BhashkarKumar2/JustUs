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
const GroupChatPage = ({ user, groupId, onBack, theme = 'dark' }) => { // Added theme prop
    const [group, setGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [inputState, setInputState] = useState(''); // Synced with ComposeBar
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [lightbox, setLightbox] = useState({ visible: false, url: null, type: null, filename: null });

    // We don't need manual mention state here as we might rely on ComposeBar features or keep it simple for now.
    // However, ComposeBar doesn't natively have mention logical for groups yet, so we pass down what's needed.
    // But wait, ComposeBar is generic.

    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null); // For debounced typing indicator

    // Socket hook for real-time messaging
    const {
        messages: socketMessages,
        typingUsers,
        sendMessage: socketSend, // Primitive send
        sendTyping,
        setMessages: setSocketMessages,
        connectionStatus // Added
    } = useGroupSocket(groupId, user);

    // Messages hook for initial load and pagination
    const {
        messages: loadedMessages,
        loading: messagesLoading,
        hasMore,
        loadMore,
        setMessages: setLoadedMessages
    } = useGroupMessages(groupId);

    // Combine loaded messages with socket messages
    // We need a unified approach to setMessages for useImageUpload
    // Since we maintain two lists, we might need a workaround for optimistic UI for files.
    // Ideally, useGroupSocket should manage the unified list or we provide a wrapper.
    // For now, let's treat "socketMessages" as the "recent/live" list where temp messages go.

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
        if (isAIMessage(message)) return '🤖 AI Assistant';
        if (message.senderId === user.id) return 'You';
        return message.senderDisplayName || 'Unknown';
    };

    // Render attachment preview
    const renderAttachment = (message) => {
        if (!message.type || message.type === 'text') return null;

        const isImage = message.type === 'image';
        const isVideo = message.type === 'video';
        const isDoc = message.type === 'document' || message.type === 'pdf';

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
        if (isDoc) {
            return (
                <div className="message-attachment doc">
                    <a href={getContentUrl(message.content)} target="_blank" rel="noopener noreferrer">📄 {message.metadata?.filename || 'Document'}</a>
                </div>
            );
        }
        return null; // Unknown type
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
            />

            <div className="messages-container">
                {hasMore && (
                    <button className="load-more-btn" onClick={loadMore} disabled={messagesLoading}>
                        {messagesLoading ? 'Loading...' : 'Load older messages'}
                    </button>
                )}

                {allMessages.map((message, index) => (
                    <div
                        key={message.id || index}
                        className={`message-bubble ${message.senderId === user.id ? 'sent' : 'received'
                            } ${isAIMessage(message) ? 'ai-message' : ''} ${message.deleted ? 'deleted' : ''
                            }`}
                    >
                        <div className="message-sender">
                            {getSenderName(message)}
                        </div>
                        <div className="message-content">
                            {message.deleted
                                ? '🗑️ This message was deleted'
                                : (
                                    <>
                                        {message.type !== 'text' && renderAttachment(message)}
                                        {message.content && (message.type === 'text' || message.metadata?.caption) && (
                                            <div className="message-text">
                                                {message.type === 'text' ? message.content : (message.metadata?.caption || '')}
                                            </div>
                                        )}
                                    </>
                                )
                            }
                        </div>
                        <div className="message-time">{formatTime(message.timestamp)}</div>
                    </div>
                ))}

                {typingUsers.length > 0 && (
                    <div className="typing-indicator">
                        {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <ComposeBar
                text={inputState}
                setText={setInputState}
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
        </div>
    );
};

export default GroupChatPage;
