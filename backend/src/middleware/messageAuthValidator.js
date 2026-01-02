/**
 * CRITICAL: Server-Side Message Authorization Validator
 * 
 * This is a defense-in-depth security layer that validates message access
 * at the database level, ensuring NO message is ever sent to an unauthorized user.
 * 
 * Use this before any message broadcast to guarantee privacy.
 */

/**
 * Validates that a user is authorized to receive a specific message
 * @param {Object} message - The message document
 * @param {String} userId - The user requesting access
 * @returns {Boolean} - True if authorized, false otherwise
 */
export const isUserAuthorizedForMessage = (message, userId) => {
    // User must be either sender or receiver
    const authorized = (
        message.senderId === userId ||
        message.senderId?.toString() === userId ||
        message.receiverId === userId ||
        message.receiverId?.toString() === userId
    );

    if (!authorized) {
        console.error(`[SECURITY VIOLATION] Unauthorized access attempt!`);
        console.error(`[SECURITY] User ${userId} tried to access message ${message._id}`);
        console.error(`[SECURITY] Message sender: ${message.senderId}, receiver: ${message.receiverId}`);
    }

    return authorized;
};

/**
 * Validates that a user is a participant in a conversation
 * @param {Object} conversation - The conversation document  
 * @param {String} userId - The user requesting access
 * @returns {Boolean} - True if participant, false otherwise
 */
export const isUserInConversation = (conversation, userId) => {
    const isParticipant = (
        conversation.participantA === userId ||
        conversation.participantA?.toString() === userId ||
        conversation.participantB === userId ||
        conversation.participantB?.toString() === userId
    );

    if (!isParticipant) {
        console.error(`[SECURITY VIOLATION] Unauthorized conversation access!`);
        console.error(`[SECURITY] User ${userId} tried to access conversation ${conversation._id}`);
        console.error(`[SECURITY] Participants: ${conversation.participantA}, ${conversation.participantB}`);
    }

    return isParticipant;
};

/**
 * Filters an array of messages to only include those the user is authorized to see
 * @param {Array} messages - Array of message documents
 * @param {String} userId - The user ID
 * @returns {Array} - Filtered array of authorized messages
 */
export const filterAuthorizedMessages = (messages, userId) => {
    const authorizedMessages = messages.filter(msg => isUserAuthorizedForMessage(msg, userId));

    const blockedCount = messages.length - authorizedMessages.length;
    if (blockedCount > 0) {
        console.error(`[SECURITY] Blocked ${blockedCount} unauthorized messages for user ${userId}`);
    }

    return authorizedMessages;
};
