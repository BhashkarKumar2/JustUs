import { getAuthenticatedApi } from './api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const uploadAvatar = async (file) => {
  try {
    const formData = new FormData();
    formData.append('avatar', file);

    // Use authenticated API instance so Authorization header is included
    const api = getAuthenticatedApi();
    const response = await api.post(
      '/api/auth/avatar/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    console.log('[avatar] Upload successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[avatar] Upload failed:', error);
    throw error;
  }
};

export const getAvatarUrl = (avatarUrl) => {
  if (!avatarUrl) return null;
  // If it's already a full URL, return as-is
  if (avatarUrl.startsWith('http')) {
    return avatarUrl;
  }
  // Otherwise, prepend API URL
  return `${API_URL}${avatarUrl}`;
};
