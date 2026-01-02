// Utility for loading media files with authentication
import api, { getAuthenticatedApi } from '../services/api';

const mediaCache = new Map();
const blobCache = new Map(); // Keep blobs in memory to prevent garbage collection

export const loadAuthenticatedMedia = async (mediaUrl, mediaId) => {
  // Check if we already have this media cached
  if (mediaCache.has(mediaId)) {
    console.log('🎵 MediaLoader: Using cached media for ID:', mediaId);
    return mediaCache.get(mediaId);
  }

  try {
    console.log('🎵 MediaLoader: Loading authenticated media');
    console.log('  Original URL:', mediaUrl);
    console.log('  Media ID:', mediaId);
    
    // IMPORTANT:
    // - In development, the CRA proxy handles relative `/api/*` paths
    // - In production (Vercel), we must call the Render backend URL with absolute URL
    const baseApi = process.env.REACT_APP_API_URL || '';
    let apiUrl;
    if (baseApi && baseApi.startsWith('http')) {
      // Production: use absolute URL
      apiUrl = `${baseApi}/api/media/file/${mediaId}`;
    } else {
      // Development: use relative URL (proxy handles it)
      apiUrl = `/api/media/file/${mediaId}`;
    }
    
    console.log('  Using API URL:', apiUrl);
    
    // Ensure we have a token before making the request
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('🎵 MediaLoader: ❌ No authentication token available');
      throw new Error('No authentication token available');
    }
    
    console.log('🎵 MediaLoader: Token found:', token.substring(0, 30) + '...');
    
    // Method 1: Try with Authorization header
    console.log('🎵 MediaLoader: Attempting fetch with Authorization header');
    try {
      const headerResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'audio/*,image/*',
          'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
        },
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit'
      });
      
      console.log('  Response status:', headerResponse.status);
      
      if (headerResponse.ok) {
        const blob = await headerResponse.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobCache.set(mediaId, blob);
        mediaCache.set(mediaId, blobUrl);
        console.log('✅ MediaLoader: Successfully loaded media with header auth');
        console.log('  Blob URL:', blobUrl);
        return blobUrl;
      } else if (headerResponse.status === 401) {
        console.warn('🎵 MediaLoader: Header auth returned 401 - Token expired, redirecting to sign in');
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        window.location.href = '/signin';
        throw new Error('Authentication expired');
      }
    } catch (headerError) {
      console.warn('🎵 MediaLoader: Header auth failed:', headerError.message);
    }
    
    // Method 2: Fallback to query parameter
    console.log('🎵 MediaLoader: Attempting fetch with token query parameter');
    const separator = apiUrl.includes('?') ? '&' : '?';
    const urlWithToken = `${apiUrl}${separator}token=${token}`;
    
    const queryResponse = await fetch(urlWithToken, {
      method: 'GET',
      headers: {
        'Accept': 'audio/*,image/*',
        'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
      },
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit'
    });
    
    console.log('  Response status:', queryResponse.status);
    
    if (!queryResponse.ok) {
      console.error('❌ MediaLoader: Query param auth also failed');
      console.error('  Status:', queryResponse.status);
      
      // Handle 401 errors
      if (queryResponse.status === 401) {
        console.warn('🎵 MediaLoader: Authentication expired, redirecting to sign in');
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        window.location.href = '/signin';
      }
      
      throw new Error(`Failed to fetch media: ${queryResponse.status}`);
    }
    
    const blob = await queryResponse.blob();
    const blobUrl = URL.createObjectURL(blob);
    blobCache.set(mediaId, blob);
    mediaCache.set(mediaId, blobUrl);
    console.log('✅ MediaLoader: Successfully loaded media with query param');
    console.log('  Blob URL:', blobUrl);
    return blobUrl;
    
  } catch (error) {
    console.error('❌ MediaLoader: Failed to load authenticated media');
    console.error('  Error:', error.message);
    throw error;
  }
};

// For PDFs and documents - downloads or opens in new tab
export const loadAuthenticatedDocument = async (documentUrl, mimeType = 'application/pdf', isPreview = false, filename = 'document.pdf') => {
  try {
    console.log('Loading authenticated document:', documentUrl);
    
    // Get the backend API URL
    const apiURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    
    // Convert to full URL if needed
    let fullUrl = documentUrl;
    if (!documentUrl.startsWith('http')) {
      fullUrl = `${apiURL}${documentUrl}`;
    }
    
    console.log('Fetching from:', fullUrl);
    
    // Get authentication token
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token available');
    }

    // Fetch with authentication
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': mimeType
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to load document: ${response.status} ${response.statusText}`);
    }

    // Get file as blob
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    if (isPreview) {
      // Open in new tab
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow) {
        alert('Please allow popups to view the file');
      }
      
      // Clean up after a delay
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 60000); // Revoke after 1 minute
    } else {
      // Trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up blob URL after download
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    }
  } catch (error) {
    console.error('Error loading document:', error);
    throw error;
  }
};

export const revokeMediaUrl = (mediaId) => {
  const blobUrl = mediaCache.get(mediaId);
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    mediaCache.delete(mediaId);
  }
};

export const clearMediaCache = () => {
  mediaCache.forEach((blobUrl) => {
    URL.revokeObjectURL(blobUrl);
  });
  mediaCache.clear();
};
