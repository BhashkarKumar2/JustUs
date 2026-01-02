import React from 'react';

export default function ReplyPreview({ replyToMessage, onCancel, colors }) {
  if (!replyToMessage) return null;

  const getPreviewContent = () => {
    switch (replyToMessage.type) {
      case 'text':
        return replyToMessage.content;
      case 'image':
        return '📷 Image';
      case 'audio':
        return '🎤 Voice message';
      case 'document':
        return `📄 ${replyToMessage.metadata?.filename || 'Document'}`;
      case 'video':
        return '🎥 Video';
      case 'call':
        return '📞 Call';
      default:
        return replyToMessage.content;
    }
  };

  return (
    <div style={{
      padding: '12px 16px',
      background: colors.replyPreviewBg || '#f3f4f6',
      borderLeft: `3px solid ${colors.primary || '#3b82f6'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px'
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: colors.primary || '#3b82f6',
          marginBottom: '2px'
        }}>
          Replying to {replyToMessage.senderId === replyToMessage.currentUserId ? 'yourself' : replyToMessage.senderName}
        </div>
        <div style={{
          fontSize: '0.875rem',
          color: colors.replyPreviewText || '#6b7280',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {getPreviewContent()}
        </div>
      </div>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          color: colors.text || '#374151',
          fontSize: '1.25rem',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="Cancel reply"
      >
        ✕
      </button>
    </div>
  );
}
