import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { getAvatarUrl } from '../../services/avatarService';
import { toast } from 'react-hot-toast';

export default function UserSelectModal({ show, onClose, availableUsers, currentUserId, onSelect, darkMode, currentChatUserId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [userInviteCode, setUserInviteCode] = useState('');
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  // Fetch user's own invite code
  useEffect(() => {
    if (show) {
      const fetchInviteCode = async () => {
        try {
          const res = await api.get('/api/auth/me');
          setUserInviteCode(res.data.inviteCode || '');
        } catch (error) {
          console.error('Failed to fetch invite code:', error);
        }
      };
      fetchInviteCode();
    }
  }, [show]);

  // ESC key handler
  useEffect(() => {
    if (!show) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  // Click outside handler
  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, onClose]);

  // Focus search input when modal opens
  useEffect(() => {
    if (show && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 50);
    }
    // Reset search when modal closes
    if (!show) {
      setSearchQuery('');
      setInviteCode('');
      setCopiedCode(false);
    }
  }, [show]);

  if (!show) return null;

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    if (localStorage.getItem('invite_connecting') === '1') {
      toast.error('An invite is already being processed. Please wait...');
      return;
    }

    setLoading(true);
    localStorage.setItem('invite_connecting', '1');
    try {
      const res = await api.post('/api/auth/connect', { inviteCode: inviteCode.trim() });
      toast.success(`Connected with ${res.data.user.displayName}!`);
      window.location.reload();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to connect');
    } finally {
      setLoading(false);
      localStorage.removeItem('invite_connecting');
    }
  };

  const handleCopyInviteCode = () => {
    if (userInviteCode) {
      navigator.clipboard.writeText(userInviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Filter contacts based on search query
  const contacts = availableUsers.filter(u => u.id !== currentUserId);
  const filteredContacts = contacts.filter(u =>
    searchQuery === '' ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="contacts-modal-title">
      <div ref={modalRef} className={`${darkMode ? 'bg-gray-900 text-gray-100 border-white/10' : 'bg-white text-gray-900 border-white/20'} border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col`} style={{ animation: 'slideDown 0.2s ease-out' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}">
          <div className="flex items-center justify-between mb-4">
            <h3 id="contacts-modal-title" className={`text-xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Contacts
            </h3>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search or add contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-xl border ${darkMode
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-indigo-500'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:border-indigo-500'
                } focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md ${darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredContacts.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <svg className={`w-16 h-16 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>No contacts found</p>
              <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Try adding them using invite code below</p>
            </div>
          )}

          {filteredContacts.length === 0 && !searchQuery && contacts.length === 0 && (
            <div className="text-center py-8">
              <svg className={`w-16 h-16 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>No contacts yet</p>
              <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Add someone using their invite code below</p>
            </div>
          )}

          {filteredContacts.length > 0 && (
            <>
              <div className={`text-xs font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {searchQuery ? `${filteredContacts.length} result${filteredContacts.length !== 1 ? 's' : ''}` : 'Recent Chats'}
              </div>
              <div className="space-y-1">
                {filteredContacts.map(u => (
                  <button
                    key={u.id}
                    onClick={() => onSelect(u.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-center gap-3 ${currentChatUserId === u.id
                      ? darkMode
                        ? 'bg-indigo-900/40 border border-indigo-700'
                        : 'bg-indigo-50 border border-indigo-200'
                      : darkMode
                        ? 'hover:bg-gray-700/50 border border-transparent'
                        : 'hover:bg-gray-50 border border-transparent'
                      }`}
                  >
                    <img
                      src={getAvatarUrl(u.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.username)}&size=40&background=6366f1&color=ffffff&bold=true`}
                      alt=""
                      onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.username)}&size=40&background=6366f1&color=ffffff&bold=true`;
                      }}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        {u.displayName || u.username}
                      </div>
                      <div className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        @{u.username}
                      </div>
                    </div>
                    {currentChatUserId === u.id && (
                      <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`} />

        {/* Add New Contact Section */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className={`w-5 h-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Add new contact</span>
          </div>

          <form onSubmit={handleConnect} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter invite code"
                className={`flex-1 px-3 py-2.5 rounded-lg border ${darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-indigo-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-indigo-500'
                  } focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all`}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                maxLength={8}
              />
              <button
                type="submit"
                disabled={loading || !inviteCode.trim()}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${darkMode
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-700 disabled:text-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-200 disabled:text-gray-400'
                  } disabled:cursor-not-allowed`}
              >
                {loading ? '...' : 'Invite'}
              </button>
            </div>

            {/* User's own invite code */}
            {userInviteCode && (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <svg className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className={`text-sm flex-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Your code: <span className={`font-mono font-semibold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{userInviteCode}</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyInviteCode}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${copiedCode
                    ? darkMode
                      ? 'bg-green-900/40 text-green-400'
                      : 'bg-green-100 text-green-700'
                    : darkMode
                      ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                >
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
