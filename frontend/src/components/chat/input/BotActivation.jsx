import React from 'react';
import './BotActivation.css';

/**
 * BotActivation Component
 * Shows when user is interacting with the bot (after typing @#)
 */
const BotActivation = ({ isActive, onDeactivate }) => {
  if (!isActive) return null;

  return (
    <div className="bot-activation-indicator">
      <div className="bot-activation-content">
        <div className="bot-icon">
          <svg
            width="20"
            height="20"
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
        <div className="bot-activation-text">
          <div className="bot-activation-title">🤖 Bot Assistant Active</div>
          <div className="bot-activation-subtitle">
            Ask me anything! I'm here to help.
          </div>
        </div>
        <button
          className="bot-deactivate-btn"
          onClick={onDeactivate}
          title="Exit bot mode"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default BotActivation;
