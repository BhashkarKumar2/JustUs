import React, { useState, useRef, useEffect } from 'react';
import { uploadAvatar, getAvatarUrl } from '../../services/avatarService';
import { updateProfile } from '../../services/auth';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिंदी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'ur', name: 'Urdu (اردو)' },
  { code: 'od', name: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'as', name: 'Assamese (অসমীয়া)' }
];

export default function ProfileModal({ show, onClose, user, onAvatarUpdate, onProfileUpdate, theme }) {
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  const isDark = theme === 'dark';

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

  // Theme-based styles
  const styles = {
    modalBg: isDark ? 'bg-gray-900/60 border-white/10 backdrop-blur-xl' : 'bg-white/60 border-white/20 backdrop-blur-xl',
    textPrimary: isDark ? 'text-gray-100' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-500',
    inputBg: isDark ? 'bg-gray-800/50' : 'bg-white/50',
    inputText: isDark ? 'text-gray-100' : 'text-gray-900',
    inputBorder: isDark ? 'border-gray-600' : 'border-gray-300',
    disabledInputBg: isDark ? 'bg-[#111b21]' : 'bg-gray-50',
    disabledInputText: isDark ? 'text-gray-400' : 'text-gray-500',
    cancelBtn: isDark ? 'bg-[#2a3942] hover:bg-[#374248] text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800',
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setPreferredLanguage(user.preferredLanguage || 'en');
    }
  }, [user]);

  if (!show) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);

    // Upload immediately
    handleUpload(file);
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      console.log('[profile] Avatar uploaded:', result);

      // Update parent with new avatar URL
      if (onAvatarUpdate) {
        onAvatarUpdate(result.avatarUrl);
      }

      // Show immediate preview using the returned URL
      setPreviewUrl(getAvatarUrl(result.avatarUrl));
      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('[profile] Upload failed:', error);
      alert('Failed to upload profile picture: ' + (error.response?.data?.message || error.message));
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updatedUser = await updateProfile({
        displayName,
        preferredLanguage
      });

      if (onProfileUpdate) {
        onProfileUpdate(updatedUser.user);
      }

      alert('Profile updated successfully!');
      onClose();
    } catch (error) {
      console.error('Profile update failed:', error);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatarUrl = previewUrl || getAvatarUrl(user?.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.username || 'User')}&size=200&background=6366f1&color=ffffff&bold=true`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div ref={modalRef} className={`${styles.modalBg} rounded-2xl p-6 w-full max-w-md shadow-2xl border animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto`}>
        <div className="text-center mb-6">
          <h3 id="profile-modal-title" className={`text-xl font-bold ${styles.text} mb-2`}>Profile Settings</h3>
          <p className={`${styles.subText} text-sm`}>Manage your profile picture and information</p>
        </div>

        {/* Avatar Preview */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <img
              src={currentAvatarUrl}
              alt=""
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.username || 'User')}&size=200&background=6366f1&color=ffffff&bold=true`;
              }}
              className="w-32 h-32 rounded-full object-cover border-4 border-indigo-200 shadow-lg"
              style={{ backgroundColor: '#6366f1' }}
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            {uploading ? 'Uploading...' : 'Change Profile Picture'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <p className={`text-xs ${styles.textSecondary} mt-2`}>JPG, PNG or GIF • Max 5MB</p>
        </div>

        {/* User Info Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className={`block text-sm font-medium ${styles.textSecondary} mb-1`}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={`w-full px-3 py-2 border ${styles.inputBorder} rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${styles.inputBg} ${styles.inputText}`}
              placeholder="Enter your display name"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium ${styles.textSecondary} mb-1`}>Preferred Language</label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className={`w-full px-3 py-2 border ${styles.inputBorder} rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${styles.inputBg} ${styles.inputText}`}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className={isDark ? 'bg-gray-800 text-white' : ''}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p className={`text-xs ${styles.textSecondary} mt-1`}>Messages will be translated to this language automatically.</p>
          </div>

          <div>
            <label className={`block text-sm font-medium ${styles.textSecondary} mb-1`}>Username</label>
            <input
              type="text"
              value={user?.username || ''}
              disabled
              className={`w-full px-3 py-2 border ${styles.inputBorder} rounded-lg ${styles.disabledInputBg} ${styles.disabledInputText}`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium ${styles.textSecondary} mb-1`}>Email</label>
            <input
              type="text"
              value={user?.email || ''}
              disabled
              className={`w-full px-3 py-2 border ${styles.inputBorder} rounded-lg ${styles.disabledInputBg} ${styles.disabledInputText}`}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={`flex-1 ${styles.cancelBtn} py-3 rounded-xl transition-colors duration-200 font-medium`}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl transition-colors duration-200 font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
