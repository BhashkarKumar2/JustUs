import React, { useState, useEffect, useRef } from 'react';
import aiService from '../../services/aiService';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';

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
      toast.error('Search failed: ' + error.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Smart search messages"
        style={{
          width: '100%',
          maxWidth: '500px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: darkMode ? '#1f2c33' : '#fff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease-out'
        }}>

        {/* Header */}
        <div style={{
          padding: '16px',
          borderBottom: darkMode ? '1px solid #2a3942' : '1px solid #e5e5e5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: darkMode ? '#e9edef' : '#111' }}>
            Search Conversation
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: darkMode ? '#9ca3af' : '#6b7280',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%'
            }}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto' }}>
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
                  fontSize: '14px',
                  outline: 'none'
                }}
                disabled={searching}
                autoFocus
              />
              <button
                type="submit"
                disabled={searching || !query.trim()}
                style={{
                  padding: '0 20px',
                  background: searching ? '#ccc' : '#00a884',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: searching ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  whiteSpace: 'nowrap'
                }}
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>
          </form>

          {searching && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <LoadingSpinner />
              <p style={{ color: darkMode ? '#9ca3af' : '#6b7280', marginTop: '16px', fontSize: '14px' }}>
                AI is analyzing your messages...
              </p>
            </div>
          )}

          {results && !searching && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{
                padding: '16px',
                background: darkMode ? '#0b141a' : '#f0f8ff',
                borderRadius: '12px',
                marginBottom: '20px',
                borderLeft: '4px solid #00a884'
              }}>
                <h4 style={{
                  margin: '0 0 8px 0',
                  color: darkMode ? '#00a884' : '#008069',
                  fontSize: '14px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  AI Summary
                </h4>
                <p style={{
                  margin: 0,
                  color: darkMode ? '#d1d7db' : '#1f2937',
                  fontSize: '15px',
                  lineHeight: '1.6'
                }}>
                  {results.summary}
                </p>
                <p style={{
                  margin: '12px 0 0 0',
                  color: darkMode ? '#8696a0' : '#6b7280',
                  fontSize: '12px',
                  fontStyle: 'italic'
                }}>
                  Found {results.totalFound} relevant message{results.totalFound !== 1 ? 's' : ''}
                </p>
              </div>

              {results.results.length > 0 && (
                <div>
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: darkMode ? '#e9edef' : '#111',
                    fontSize: '16px',
                    fontWeight: '600'
                  }}>
                    Relevant Messages
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {results.results.map((msg, idx) => (
                      <div
                        key={idx}
                        onClick={() => onResultClick && onResultClick(msg)}
                        style={{
                          padding: '14px',
                          background: darkMode ? '#111b21' : '#f9fafb',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: darkMode ? '1px solid #2a3942' : '1px solid #e5e7eb',
                          transition: 'all 0.2s',
                          position: 'relative'
                        }}
                        className="hover:shadow-md"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = darkMode ? '#00a884' : '#008069';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = darkMode ? '#2a3942' : '#e5e7eb';
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                          fontSize: '12px',
                          color: darkMode ? '#8696a0' : '#6b7280'
                        }}>
                          <span style={{ fontWeight: 600, color: darkMode ? '#e9edef' : '#374151' }}>
                            {msg.senderName || msg.senderId}
                          </span>
                          <span>{new Date(msg.timestamp).toLocaleDateString()}</span>
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: darkMode ? '#d1d7db' : '#1f2937',
                          lineHeight: '1.5'
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
      </div>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
