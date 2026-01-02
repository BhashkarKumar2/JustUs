/**
 * Merges new messages into an existing message array, strictly enforcing uniqueness by ID.
 * Handles duplicate checks against both `id` and `_id` properties.
 * Also replaces temporary (optimistic) messages with their real server counterparts.
 * 
 * @param {Array} currentMessages - The current state of messages.
 * @param {Array} newMessages - The new messages to add or update.
 * @returns {Array} - The merged, sorted, and deduplicated array.
 */
export const mergeMessages = (currentMessages, newMessages) => {
    if (!newMessages || newMessages.length === 0) return currentMessages;

    // Create a Map for O(1) lookups and easy updates.
    const messageMap = new Map();

    // 1. Load current messages into Map
    currentMessages.forEach(msg => {
        const key = msg.id || msg._id;
        if (key) {
            messageMap.set(String(key), msg);
        }
    });

    // 2. Merge new messages
    newMessages.forEach(msg => {
        const key = msg.id || msg._id;
        if (!key) return; // Skip invalid messages without ID

        const strKey = String(key);
        const existing = messageMap.get(strKey);

        if (existing) {
            // If existing is temporary and new is real => Replace
            if (existing.temporary && !msg.temporary) {
                messageMap.set(strKey, msg);
            }
            // If both real, merge properties (e.g. read status, content edit)
            else if (!existing.temporary && !msg.temporary) {
                messageMap.set(strKey, { ...existing, ...msg });
            }
        } else {
            // Check if this new message should replace a temporary one
            // Match by: sender, receiver, content, type, and close timestamp (within 10 seconds)
            if (!msg.temporary) {
                let replacedTemp = false;
                for (const [existingKey, existingMsg] of messageMap.entries()) {
                    if (
                        existingMsg.temporary &&
                        existingMsg.senderId === msg.senderId &&
                        existingMsg.receiverId === msg.receiverId &&
                        existingMsg.type === msg.type &&
                        existingMsg.content === msg.content &&
                        Math.abs(new Date(existingMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
                    ) {
                        // Remove the temp message and add the real one
                        messageMap.delete(existingKey);
                        messageMap.set(strKey, msg);
                        replacedTemp = true;
                        break;
                    }
                }
                if (!replacedTemp) {
                    messageMap.set(strKey, msg);
                }
            } else {
                // New temporary message
                messageMap.set(strKey, msg);
            }
        }
    });

    // 3. Convert back to array
    const result = Array.from(messageMap.values());

    // 4. Sort by timestamp
    result.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt).getTime();
        const timeB = new Date(b.timestamp || b.createdAt).getTime();
        return timeA - timeB;
    });

    return result;
};

