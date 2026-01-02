import React from 'react';
import './BotMessage.css';

/**
 * BotMessage Component
 * Renders bot responses with special styling
 */
const BotMessage = ({ message }) => {
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bot-message-container">
      <div className="bot-message-wrapper">
        <div className="bot-avatar">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
              fill="currentColor"
            />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" />
            <circle cx="15" cy="10" r="1.5" fill="currentColor" />
            <path
              d="M12 17.5C14.33 17.5 16.32 16.04 17.11 14H6.89C7.68 16.04 9.67 17.5 12 17.5Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="bot-message-content">
          <div className="bot-message-header">
            <span className="bot-name">🤖 Bot Assistant</span>
            <span className="bot-badge">AI</span>
          </div>
          <div className="bot-message-text">
            {message.content}
          </div>
          <div className="bot-message-footer">
            <span className="bot-timestamp">
              {formatTimestamp(message.timestamp)}
            </span>
            <span className="bot-powered-by">
              Powered by Gemini
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BotMessage;
