import { useState } from 'react';
import { getAuthenticatedApi } from '../services/api';
import { sendSocketMessage } from '../services/socket';

export default function useImageUpload({ userId, otherUserId, conversationId, setMessages }) {
  const [uploading, setUploading] = useState(false);

  // Trigger file selection dialog
  const selectFile = (onFileSelected) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file && onFileSelected) {
        onFileSelected(file);
      }
    };
    input.click();
  };

  // Upload and send the file with optional caption
  const uploadFile = async (file, caption = '') => {
    // Determine file type
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isPdf && !isImage && !isVideo) {
      alert('Please select an image, video, or PDF file');
      return;
    }

    // Create temp message first so we can update it with progress
    let type = 'image';
    if (isPdf) type = 'document';
    if (isVideo) type = 'video';

    const metadata = {
      ...(isPdf ? { filename: file.name, fileType: 'pdf' } : (isVideo ? { filename: file.name, fileType: 'video' } : {})),
      caption: caption,
      progress: 0 // Initial progress
    };

    const tempId = 'temp-file-' + Date.now();
    const tempMessage = {
      id: tempId,
      type,
      content: URL.createObjectURL(file), // Use local blob for immediate preview
      senderId: userId,
      receiverId: otherUserId,
      conversationId,
      timestamp: new Date().toISOString(),
      temporary: true,
      metadata
    };

    setMessages(prev => [...prev, tempMessage]);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (conversationId) fd.append('conversationId', conversationId);

      const authenticatedApi = getAuthenticatedApi();
      const res = await authenticatedApi.post('/api/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Update message state with progress
          setMessages(prev => prev.map(msg =>
            msg.id === tempId
              ? { ...msg, metadata: { ...msg.metadata, progress: percentCompleted } }
              : msg
          ));
        }
      });

      const id = res.data.id;
      const url = `/api/media/file/${id}`;

      // Update metadata to remove progress or mark complete
      const finalMetadata = { ...metadata };
      delete finalMetadata.progress;

      // Update the temp message with real URL and finalize
      // NOTE: We keep it temporary until we send the socket message to avoid flickering, 
      // or we can just send the socket message and let the real message replace it.
      // Better to rely on the socket/api flow now.

      const success = sendSocketMessage({
        receiverId: otherUserId || 'other',
        type,
        content: url,
        conversationId,
        senderId: userId,
        metadata: finalMetadata
      });

      if (!success) {
        try {
          const sentMsg = await authenticatedApi.post('/api/chat/messages', {
            type,
            content: url,
            receiverId: otherUserId,
            conversationId,
            metadata: finalMetadata
          });
          // Replace temp with confirmed
          setMessages(prev => prev.map(msg => msg.id === tempId ? { ...sentMsg.data, temporary: false } : msg));
        } catch (apiError) {
          setMessages(prev => prev.filter(msg => msg.id !== tempId));
          alert('Failed to send file. Please try again.');
        }
      } else {
        // Socket sent successfully - remove temp message since server will echo back the real one
        // The real message will have a proper server-generated ID
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file: ' + (error.response?.data?.message || error.message));
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    } finally {
      setUploading(false);
    }
  };

  // Backward compatibility alias (if selectFile is called without arg, it won't do anything useful, 
  // but existing code might rely on uploadImage doing everything. 
  // We'll deprecate uploadImage in favor of explicit flow in ComposeBar).
  // Actually, let's keep uploadImage for direct calls if we wanted, 
  // but we are updating ComposeBar anyway.

  return { uploading, selectFile, uploadFile };
}
