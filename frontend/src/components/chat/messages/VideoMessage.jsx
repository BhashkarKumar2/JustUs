import React, { useEffect, useState } from 'react';
import { loadAuthenticatedMedia } from '../../../utils/mediaLoader';

export default function VideoMessage({ message, mine, onOpenLightbox, theme, colors }) {
    const [videoUrl, setVideoUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [downloaded, setDownloaded] = useState(false);

    // Styles derived from colors prop or defaults - matching AudioMessage
    const containerStyle = {
        background: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.06)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    };

    // Only load video when user clicks play button
    const handleDownload = async () => {
        if (downloaded || loading) return;

        setDownloaded(true);

        // If temporary (local blob), use directly
        if (!message.content || message.temporary) {
            setVideoUrl(message.content);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(false);
            const urlParts = message.content.split('/');
            const mediaId = urlParts[urlParts.length - 1].split('?')[0];
            const authenticatedBlobUrl = await loadAuthenticatedMedia(message.content, mediaId);
            setVideoUrl(authenticatedBlobUrl);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load authenticated video:', error);
            setError(true);
            setLoading(false);
        }
    };

    // Auto-load temporary messages (uploads in progress)
    useEffect(() => {
        if (message.temporary) {
            setDownloaded(true);
            setVideoUrl(message.content);
        }
    }, [message.content, message.temporary]);

    if (error) {
        return (
            <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden border" style={containerStyle}>
                    <div className="flex items-center justify-center h-32 p-4" style={{ color: theme === 'dark' ? '#9ca3af' : '#4b5563' }}>
                        <div className="text-center">
                            <p className="text-xs mb-2 font-medium">Video failed to load</p>
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
                // Placeholder with play button - responsive sizing
                <div className="relative rounded-lg overflow-hidden border" style={containerStyle}>
                    <div className="flex flex-col items-center justify-center h-32 sm:h-40 md:h-48 w-full max-w-[240px] sm:max-w-xs md:w-64 text-gray-300 p-4 sm:p-6">
                        <svg className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 mb-3 sm:mb-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                        <p className="text-xs sm:text-sm font-medium mb-2 sm:mb-3">Video</p>
                        <button
                            onClick={handleDownload}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-500 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-indigo-600 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            Play Video
                        </button>
                    </div>
                </div>
            ) : loading ? (
                <div className="relative rounded-lg overflow-hidden border" style={containerStyle}>
                    <div className="flex items-center justify-center h-48 w-64" style={{ color: theme === 'dark' ? '#9ca3af' : '#4b5563' }}>
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-3 text-sm font-medium">Loading video...</span>
                    </div>
                </div>
            ) : (
                <div className="relative rounded-lg overflow-hidden max-w-xs md:max-w-sm">
                    <video
                        controls
                        src={videoUrl}
                        style={{ maxHeight: '250px', width: 'auto' }} // Limit vertical height
                        className="w-full rounded-lg shadow-md bg-black cursor-pointer"
                        onError={() => setError(true)}
                        onClick={(e) => {
                            // Only open lightbox if clicking on video itself, not controls
                            if (e.target.tagName === 'VIDEO' && onOpenLightbox) {
                                onOpenLightbox(videoUrl, 'video', message.metadata?.filename);
                            }
                        }}
                    />

                    {message.metadata?.filename && (
                        <div className="absolute top-2 left-2 right-2 flex justify-between pointer-events-none">
                            <div className="text-xs text-white/90 bg-black/40 px-2 py-1 rounded truncate max-w-[80%]">
                                {message.metadata.filename}
                            </div>
                        </div>
                    )}

                    {message.temporary && (
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center backdrop-blur-[1px] pointer-events-none">
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
