import React, { useState, useRef, useEffect } from 'react';
import { uploadAvatar, getAvatarUrl } from '../../services/avatarService';
import { updateProfile } from '../../services/auth';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// Utility to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
  const [subscribing, setSubscribing] = useState(false); // Notifications loading state
  const [previewUrl, setPreviewUrl] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  // Notification State
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);

  const checkSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const currentPermission = Notification.permission;

      console.log('[Notifications] Checking:', {
        hasSubscription: !!subscription,
        permission: currentPermission
      });

      setIsSubscribed(!!subscription);
      setPermission(currentPermission);
    } catch (error) {
      console.error('[Notifications] Failed to check checkSubscription:', error);
    }
  };

  useEffect(() => {
    checkSubscription();
  }, [show]);

  const subscribeUser = async () => {
    if (!('serviceWorker' in navigator)) {
      toast.error('Push notifications are not supported in this browser');
      return;
    }

    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

      if (!publicVapidKey) {
        console.error('VAPID public key not found');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      const token = localStorage.getItem('token');
      await axios.post('/api/notifications/subscribe', subscription, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setIsSubscribed(true);
      setPermission(Notification.permission);
      setIsSubscribed(true);
      setPermission(Notification.permission);
      toast.success('Notifications enabled successfully!');
    } catch (err) {
      console.error('Failed to subscribe:', err);
      if (Notification.permission === 'denied') {
        toast.error('Notifications are blocked. Please enable them in your browser settings.');
      } else {
        toast.error('Failed to enable notifications. Please try again.');
      }
    } finally {
      setSubscribing(false);
    }
  };

  const unsubscribeUser = async () => {
    setSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
        toast.success('Notifications disabled.');
      }
    } catch (error) {
      console.error('Error unsubscribing', error);
      toast.error('Failed to disable notifications');
    } finally {
      setSubscribing(false);
    }
  };

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
    // Increased opacity and darker background for better visibility in dark mode
    modalBg: isDark ? 'bg-gray-900 border-gray-700 shadow-2xl' : 'bg-white border-gray-200 shadow-xl',
    text: isDark ? 'text-white' : 'text-gray-900',
    subText: isDark ? 'text-gray-400' : 'text-gray-500',
    textPrimary: isDark ? 'text-gray-100' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-500',
    inputBg: isDark ? 'bg-gray-800' : 'bg-gray-50',
    inputText: isDark ? 'text-white' : 'text-gray-900',
    inputBorder: isDark ? 'border-gray-700' : 'border-gray-200',
    disabledInputBg: isDark ? 'bg-gray-800/50' : 'bg-gray-100',
    disabledInputText: isDark ? 'text-gray-500' : 'text-gray-500',
    cancelBtn: isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
    notificationBg: isDark ? 'bg-gray-800' : 'bg-gray-50',
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setPreferredLanguage(user.preferredLanguage || 'en');
    }
  }, [user]);

  // Reset preview URL when modal opens
  useEffect(() => {
    if (show) {
      setPreviewUrl(null);
    }
  }, [show]);

  if (!show) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);

    handleUpload(file);
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      console.log('[profile] Avatar uploaded:', result);

      if (onAvatarUpdate) {
        onAvatarUpdate(result.avatarUrl);
      }

      setPreviewUrl(getAvatarUrl(result.avatarUrl));
      toast.success('Profile picture updated successfully!');
    } catch (error) {
      console.error('[profile] Upload failed:', error);
      toast.error('Failed to upload profile picture: ' + (error.response?.data?.message || error.message));
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

      toast.success('Profile updated successfully!');
      onClose();
    } catch (error) {
      console.error('Profile update failed:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatarUrl = previewUrl || getAvatarUrl(user?.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.username || 'User')}&size=200&background=6366f1&color=ffffff&bold=true`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div ref={modalRef} className={`${styles.modalBg} rounded-2xl p-6 w-full max-w-md border animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto`}>
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
              className={`w-32 h-32 rounded-full object-cover border-4 shadow-lg ${isDark ? 'border-gray-700' : 'border-indigo-100'}`}
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

          {/* Notification Settings - Moved inside form container for consistency */}
          <div>
            <label className={`block text-sm font-medium ${styles.textSecondary} mb-2`}>Notifications</label>
            <div className={`p-4 rounded-lg flex items-center justify-between ${styles.notificationBg} border ${styles.inputBorder}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isSubscribed ? 'bg-green-100 text-green-600' : (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500')}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-medium ${styles.textPrimary}`}>Push Notifications</p>
                  <p className={`text-xs ${styles.textSecondary}`}>{isSubscribed ? 'On' : 'Off'}</p>
                </div>
              </div>
              {!isSubscribed ? (
                <button
                  onClick={subscribeUser}
                  disabled={subscribing}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {subscribing ? 'Enabling...' : 'Enable'}
                </button>
              ) : (
                <button
                  onClick={unsubscribeUser}
                  disabled={subscribing}
                  className={`text-sm border px-3 py-1.5 rounded-lg transition-colors font-medium ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'} disabled:opacity-50`}
                >
                  {subscribing ? 'Disabling...' : 'Disable'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
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
