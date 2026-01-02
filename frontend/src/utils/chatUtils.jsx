/**
 * Merges new messages into an existing message array, strictly enforcing uniqueness by ID.
 * Handles duplicate checks against both `id` and `_id` properties.
 * 
 * @param {Array} currentMessages - The current state of messages.
 * @param {Array} newMessages - The new messages to add or update.
 * @returns {Array} - The merged, sorted, and deduplicated array.
 */
export const mergeMessages = (currentMessages, newMessages) => {
    if (!newMessages || newMessages.length === 0) return currentMessages;

    // Create a Map for O(1) lookups and easy updates.
    // We prioritize real IDs (non-temp) and newer timestamps.
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
            // Logic for updating existing message
            // If existing is temporary and new is real => Replace
            if (existing.temporary && !msg.temporary) {
                messageMap.set(strKey, msg);
            }
            // If both real, merge properties (e.g. read status, content edit)
            else if (!existing.temporary && !msg.temporary) {
                messageMap.set(strKey, { ...existing, ...msg });
            }
            // If new is temporary (optimistic) and we have real => Ignore new logic?
            // Actually, usually optimistic updates handle this by swapping IDs or using temp IDs.
            // If specific keys match, we assume update is desired.
        } else {
            // New message
            messageMap.set(strKey, msg);
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
