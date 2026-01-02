import React, { useState, useEffect, useRef } from 'react';
import aiService from '../../services/aiService';
import LoadingSpinner from '../common/LoadingSpinner';

export default function SmartSearch({ conversationId, onResultClick, darkMode, onClose }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const panelRef = useRef(null);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && onClose) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const searchResults = await aiService.smartSearch(query, conversationId);
      setResults(searchResults);
    } catch (error) {
      alert('Search failed: ' + error.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Smart search messages"
      style={{
        padding: '16px',
        background: darkMode ? '#1f2c33' : '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
      <form onSubmit={handleSearch} style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything... (e.g., 'when did we discuss vacation?')"
            style={{
              flex: 1,
              padding: '12px',
              border: darkMode ? '1px solid #2a3942' : '1px solid #ddd',
              borderRadius: '8px',
              background: darkMode ? '#0b141a' : '#fff',
              color: darkMode ? '#e9edef' : '#000',
              fontSize: '14px'
            }}
            disabled={searching}
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            style={{
              padding: '12px 24px',
              background: searching ? '#ccc' : '#00a884',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: searching ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            {searching ? 'Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      {searching && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <LoadingSpinner />
          <p style={{ color: darkMode ? '#8696a0' : '#666', marginTop: '8px' }}>
            AI is analyzing your messages...
          </p>
        </div>
      )}

      {results && !searching && (
        <div>
          <div style={{
            padding: '12px',
            background: darkMode ? '#0b141a' : '#f0f8ff',
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '3px solid #00a884'
          }}>
            <h4 style={{
              margin: '0 0 8px 0',
              color: darkMode ? '#00a884' : '#008069',
              fontSize: '14px',
              fontWeight: '600'
            }}>
              AI Summary
            </h4>
            <p style={{
              margin: 0,
              color: darkMode ? '#e9edef' : '#000',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {results.summary}
            </p>
            <p style={{
              margin: '8px 0 0 0',
              color: darkMode ? '#8696a0' : '#666',
              fontSize: '12px'
            }}>
              Found {results.totalFound} relevant message{results.totalFound !== 1 ? 's' : ''}
            </p>
          </div>

          {results.results.length > 0 && (
            <div>
              <h4 style={{
                margin: '0 0 12px 0',
                color: darkMode ? '#e9edef' : '#000',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                Relevant Messages
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {results.results.map((msg, idx) => (
                  <div
                    key={idx}
                    onClick={() => onResultClick && onResultClick(msg)}
                    style={{
                      padding: '12px',
                      background: darkMode ? '#0b141a' : '#f5f5f5',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: darkMode ? '1px solid #2a3942' : '1px solid #e5e5e5',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = darkMode ? '#1f2c33' : '#e5e5e5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = darkMode ? '#0b141a' : '#f5f5f5';
                    }}
                  >
                    <div style={{
                      fontSize: '12px',
                      color: darkMode ? '#8696a0' : '#666',
                      marginBottom: '4px'
                    }}>
                      {msg.senderName || msg.senderId} • {new Date(msg.timestamp).toLocaleDateString()}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: darkMode ? '#e9edef' : '#000'
                    }}>
                      {msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
