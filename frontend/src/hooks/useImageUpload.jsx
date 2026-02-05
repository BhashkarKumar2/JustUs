import { useState } from 'react';
import { getAuthenticatedApi } from '../services/api';
import { sendSocketMessage, getSocket } from '../services/socket';
import { toast } from 'react-hot-toast';

export default function useImageUpload({ userId, otherUserId, conversationId, groupId, setMessages }) {
  const [uploading, setUploading] = useState(false);

  // Trigger file selection dialog
  const selectFile = (onFileSelected) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*'; // Allow all file types
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
    const isAudio = file.type.startsWith('audio/');

    // Create temp message first so we can update it with progress
    let type = 'file'; // Default to generic file
    if (isImage) type = 'image';
    if (isVideo) type = 'video';
    if (isAudio) type = 'audio';
    if (isPdf) type = 'document';

    const metadata = {
      filename: file.name,
      fileType: file.type || 'application/octet-stream',
      size: file.size,
      caption: caption,
      progress: 0 // Initial progress
    };

    const tempId = 'temp-file-' + Date.now();
    const tempMessage = {
      id: tempId,
      type,
      content: URL.createObjectURL(file), // Use local blob for immediate preview
      senderId: userId,
      receiverId: otherUserId, // Might be null for groups
      conversationId, // Might be null for groups
      groupId, // Connected to a group if present
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
      if (groupId) fd.append('groupId', groupId);

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

      // Send via socket
      const socket = getSocket();
      let success = false;

      if (groupId) {
        // Group Chat send
        if (socket) {
          socket.emit('group.send', {
            groupId,
            content: url,
            type,
            senderId: userId,
            metadata: finalMetadata
          });
          success = true; // Assumed success if connected
        }
      } else {
        // 1-on-1 Chat send
        success = sendSocketMessage({
          receiverId: otherUserId || 'other',
          type,
          content: url,
          conversationId,
          senderId: userId,
          metadata: finalMetadata
        });
      }

      if (!success && !groupId) {
        // Only fallback to API for 1-on-1 if socket fails (Group API fallback not fully implemented in this hook yet)
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
          toast.error('Failed to send file. Please try again.');
        }
      } else {
        // Socket sent successfully - remove temp message since server will echo back the real one
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload file: ' + (error.response?.data?.message || error.message));
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    } finally {
      setUploading(false);
    }
  };

  return { uploading, selectFile, uploadFile };
}
