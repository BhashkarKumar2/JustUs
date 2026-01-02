import React, { useEffect, useState } from 'react';
import { loadAuthenticatedMedia } from '../../../utils/mediaLoader';

export default function ImageMessage({ message, mine, onOpenLightbox }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  // Only load image when user clicks download button
  const handleDownload = async () => {
    if (downloaded || loading) return;

    setDownloaded(true);

    // If temporary (local blob), use directly
    if (!message.content || message.temporary) {
      setImageUrl(message.content);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(false);
      const urlParts = message.content.split('/');
      const mediaId = urlParts[urlParts.length - 1].split('?')[0];
      const authenticatedBlobUrl = await loadAuthenticatedMedia(message.content, mediaId);
      setImageUrl(authenticatedBlobUrl);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load authenticated image:', error);
      setError(true);
      setLoading(false);
    }
  };

  // Auto-load temporary messages (uploads in progress)
  useEffect(() => {
    if (message.temporary) {
      setDownloaded(true);
      setImageUrl(message.content);
    }
  }, [message.content, message.temporary]);

  if (error) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          <div className="flex items-center justify-center h-32 text-gray-500 p-4">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-xs mb-2 font-medium">Image failed to load</p>
              <button
                className="px-3 py-1 bg-indigo-500 text-white text-xs rounded-lg hover:bg-indigo-600 transition-colors"
                onClick={() => { setError(false); setDownloaded(false); handleDownload(); }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!downloaded ? (
        // Placeholder with download button
        <div className="relative rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300">
          <div className="flex flex-col items-center justify-center h-48 w-64 text-gray-600 p-6">
            <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium mb-3 text-gray-700">Image</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Image
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-sm font-medium">Loading image...</span>
          </div>
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden">
          <img
            src={imageUrl}
            alt="Shared image"
            style={{ maxHeight: '250px', width: 'auto', objectFit: 'contain' }} // Limit vertical height
            className="max-w-xs md:max-w-sm rounded-lg cursor-pointer transition-all duration-300 hover:scale-105 shadow-md"
            onClick={() => onOpenLightbox?.(imageUrl, 'image', message.metadata?.filename)}
            onError={() => setError(true)}
          />

          {message.temporary && (
            <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center backdrop-blur-[1px]">
              <div className="w-8 h-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin mb-2"></div>
              {message.metadata?.progress !== undefined && message.metadata.progress < 100 && (
                <span className="text-white text-xs font-medium shadow-sm drop-shadow-md">
                  {message.metadata.progress}%
                </span>
              )}
              {message.metadata?.progress !== undefined && message.metadata.progress < 100 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${message.metadata.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {message.metadata?.caption && (
        <div className="text-sm mt-1 mb-1 px-1 break-words">
          {message.metadata.caption}
        </div>
      )}
    </div>
  );
}
