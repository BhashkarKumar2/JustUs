import { useState, useRef } from 'react';
import { sendSocketMessage } from '../services/socket';
import { mergeMessages } from '../utils/chatUtils';

export default function useMessageSender({
    user,
    otherUserId,
    conversationId,
    setMessages,
    encryption
}) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [editingMessage, setEditingMessage] = useState(null);
    const [replyingTo, setReplyingTo] = useState(null);
    const sendingRef = useRef(false);

    const sendMessage = async (e) => {
        e?.preventDefault();

        if (!text.trim() || sendingRef.current || sending) return;

        sendingRef.current = true;
        setSending(true);

        const targetUserId = otherUserId || localStorage.getItem('otherUserId');

        if (!targetUserId) {
            alert('No chat partner available.');
            sendingRef.current = false;
            setSending(false);
            return;
        }

        // Handle Edit
        if (editingMessage) {
            const success = sendSocketMessage({
                id: editingMessage.id,
                type: 'text',
                content: text.trim(),
                receiverId: targetUserId,
                conversationId,
                senderId: user.id
            });

            if (!success) {
                alert('Failed to edit message. Check connection.');
            }
            setEditingMessage(null);
        }
        // Handle New Message
        else {
            // 1. Encrypt
            const receiverPublicKey = encryption.getPublicKeyForUser(targetUserId);
            let encryptedData = null;
            if (receiverPublicKey && encryption.getKeyPair()) {
                encryptedData = encryption.encryptMessage(text.trim(), receiverPublicKey);
            }

            // 2. Optimistic Update (Temp Message)
            const tempMessage = {
                id: 'temp-' + Date.now(),
                type: 'text',
                content: text.trim(), // Plaintext locally
                senderId: user.id,
                receiverId: targetUserId,
                conversationId,
                timestamp: new Date().toISOString(),
                temporary: true,
                encryptionNonce: encryptedData?.nonce,
                ciphertext: encryptedData?.ciphertext,
                replyTo: replyingTo ? {
                    id: replyingTo.id,
                    senderId: replyingTo.senderId,
                    type: replyingTo.type,
                    content: replyingTo.content,
                    metadata: replyingTo.metadata
                } : null
            };

            setMessages(prev => mergeMessages(prev, [tempMessage]));

            // 3. Send Payload
            const messageToSend = encryptedData ? {
                receiverId: targetUserId,
                type: 'text',
                ciphertext: encryptedData.ciphertext,
                nonce: encryptedData.nonce,
                conversationId,
                senderId: user.id,
                replyTo: replyingTo?.id || null,
                plaintext: text.trim() // Optional: for server-side features like translation if needed, otherwise omit for pure E2EE
            } : {
                receiverId: targetUserId,
                type: 'text',
                content: text.trim(),
                conversationId,
                senderId: user.id,
                replyTo: replyingTo?.id || null
            };

            const success = sendSocketMessage(messageToSend);
            if (!success) {
                console.error('Failed to send message via socket');
                // Could implement retry or error state here
            }
        }

        setText('');
        setReplyingTo(null);
        setSending(false);
        sendingRef.current = false;
    };

    return {
        text,
        setText,
        sending,
        editingMessage,
        setEditingMessage,
        replyingTo,
        setReplyingTo,
        sendMessage
    };
}
