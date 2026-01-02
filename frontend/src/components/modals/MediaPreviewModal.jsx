import React, { useState, useEffect } from 'react';

export default function MediaPreviewModal({
    file,
    isOpen,
    onClose,
    onSend,
    theme
}) {
    const [caption, setCaption] = useState('');
    const [previewUrl, setPreviewUrl] = useState(null);

    useEffect(() => {
        if (file) {
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                setPreviewUrl(url);
                return () => URL.revokeObjectURL(url);
            } else {
                setPreviewUrl(null);
            }
        }
    }, [file]);

    if (!isOpen || !file) return null;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1f2937' : 'white';
    const textColor = isDark ? 'white' : '#111827';
    const inputBg = isDark ? '#374151' : '#f3f4f6';
    const inputBorder = isDark ? '#4b5563' : '#e5e7eb';

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isPdf = file.type === 'application/pdf';

    const handleSubmit = (e) => {
        e.preventDefault();
        onSend(file, caption);
        setCaption('');
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: bgColor,
                borderRadius: '16px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px',
                    borderBottom: `1px solid ${inputBorder}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: textColor }}>
                        Send {isImage ? 'Image' : isVideo ? 'Video' : 'Document'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px',
                            borderRadius: '9999px',
                            color: isDark ? '#9ca3af' : '#6b7280',
                            cursor: 'pointer',
                            border: 'none',
                            background: 'transparent'
                        }}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content Preview */}
                <div style={{
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: isDark ? '#111827' : '#f9fafb',
                    minHeight: '200px',
                    flex: 1,
                    overflowY: 'auto'
                }}>
                    {isImage && previewUrl && (
                        <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', objectFit: 'contain' }} />
                    )}
                    {isVideo && previewUrl && (
                        <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
                    )}
                    {isPdf && (
                        <div style={{ textAlign: 'center', color: textColor }}>
                            <svg className="w-16 h-16 mx-auto mb-2 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                            <div style={{ fontWeight: 500 }}>{file.name}</div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                    )}
                </div>

                {/* Caption Input */}
                <form onSubmit={handleSubmit} style={{ padding: '16px', borderTop: `1px solid ${inputBorder}` }}>
                    <input
                        type="text"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a caption..."
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            backgroundColor: inputBg,
                            color: textColor,
                            border: `1px solid ${inputBorder}`,
                            marginBottom: '16px',
                            outline: 'none'
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                color: textColor,
                                cursor: 'pointer',
                                border: `1px solid ${inputBorder}`,
                                background: 'transparent'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            style={{
                                padding: '8px 24px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 500
                            }}
                        >
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
