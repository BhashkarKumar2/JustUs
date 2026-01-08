import React from 'react';
import { loadAuthenticatedDocument, loadAuthenticatedMedia } from '../../../utils/mediaLoader';
import { toast } from 'react-hot-toast';

export default function DocumentMessage({ message, mine, onOpenLightbox }) {
  const filename = message.metadata?.filename || 'document.pdf';
  const fileUrl = message.content;

  const handleDownload = async () => {
    try {
      await loadAuthenticatedDocument(fileUrl, 'application/pdf', false, filename);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download file');
    }
  };

  const handleView = async () => {
    try {
      // Use lightbox if available
      if (onOpenLightbox) {
        // Load the authenticated media first
        const urlParts = fileUrl.split('/');
        const mediaId = urlParts[urlParts.length - 1].split('?')[0];

        const authenticatedBlobUrl = await loadAuthenticatedMedia(fileUrl, mediaId);

        // Open the authenticated blob URL in lightbox
        onOpenLightbox(authenticatedBlobUrl, 'document', filename);
      } else {
        await loadAuthenticatedDocument(fileUrl, 'application/pdf', true);
      }
    } catch (error) {
      console.error('View failed:', error);
      toast.error('Failed to open file');
    }
  };

  return (
    <div className={`relative group overflow-hidden rounded-xl border ${mine ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'} shadow-sm transition-all hover:shadow-md max-w-sm`}>
      {/* Main Content Area - Click to View */}
      <div
        className="flex items-center p-3 gap-3 cursor-pointer hover:bg-black/5 transition-colors"
        onClick={handleView}
      >
        {/* Modern File Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${mine ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
            <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
          </svg>
        </div>

        {/* File Details */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">
            {filename}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {message.temporary ? (
              <span className="text-blue-500 font-medium animate-pulse">
                Uploading {message.metadata?.progress !== undefined ? message.metadata.progress : 0}%
              </span>
            ) : (
              <>
                <span>PDF</span>
                {/* Show size if available in metadata, or just a dot separator if we had more info */}
                {message.metadata?.fileSize && (
                  <>
                    <span>•</span>
                    <span>{message.metadata.fileSize}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Download Action */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
          title="Download"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 9v7.5m0 0l-3-3m3 3l3-3" />
          </svg>
        </button>
      </div>

      {/* Modern Progress Bar (Integrated) */}
      {message.temporary && message.metadata?.progress !== undefined && message.metadata.progress < 100 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${message.metadata.progress}%` }}
          />
        </div>
      )}

      {/* Caption Area - Clean and Minimal */}
      {message.metadata?.caption && (
        <div className="px-3 pb-3 pt-0">
          <p className="text-sm text-gray-700 leading-relaxed break-words border-t border-black/5 pt-2 mt-1">
            {message.metadata.caption}
          </p>
        </div>
      )}
    </div>
  );
}
