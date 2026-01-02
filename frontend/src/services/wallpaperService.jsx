import { getAuthenticatedApi } from './api';
import { loadAuthenticatedMedia } from '../utils/mediaLoader';

export const DEFAULT_WALLPAPER = {
  sourceType: 'none',
  presetKey: 'aurora',
  imageUrl: '',
  blur: 6,
  opacity: 0.9
};

const wallpaperCache = new Map();

export const buildWallpaperUrl = async (raw) => {
  // Type safety: ensure raw is a string
  if (!raw || typeof raw !== 'string') return '';

  // Gradients or data URIs can be used directly
  const isGradient = raw.startsWith('linear-gradient') || raw.startsWith('radial-gradient');
  const isData = raw.startsWith('data:');
  if (isGradient || isData) return raw;

  // For media URLs, load as authenticated blob to avoid CORS issues
  if (raw.includes('/api/media/file/')) {
    // Check cache first
    if (wallpaperCache.has(raw)) {
      return wallpaperCache.get(raw);
    }

    try {
      const urlParts = raw.split('/');
      const mediaId = urlParts[urlParts.length - 1].split('?')[0];
      const blobUrl = await loadAuthenticatedMedia(raw, mediaId);
      wallpaperCache.set(raw, blobUrl);
      return blobUrl;
    } catch (error) {
      console.error('Failed to load wallpaper image:', error);
      return '';
    }
  }

  // External URLs can be used directly
  return raw;
};

export const fetchWallpaper = async (conversationId) => {
  if (!conversationId) return DEFAULT_WALLPAPER;
  const api = getAuthenticatedApi();
  const res = await api.get('/api/chat/wallpaper', {
    params: { conversationId }
  });
  return { ...DEFAULT_WALLPAPER, ...(res.data || {}) };
};

export const saveWallpaper = async (conversationId, settings) => {
  const api = getAuthenticatedApi();
  const res = await api.post('/api/chat/wallpaper', {
    conversationId,
    ...settings
  });
  return res.data;
};
