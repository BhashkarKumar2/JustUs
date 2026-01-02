/**
 * In-memory rate limiter for WebSocket events
 * SDE 3 Design: Sliding window algorithm with auto-cleanup
 * 
 * Limits: 30 messages per minute per user
 * Memory: O(n) where n = active users in last minute
 * Cleanup: Runs every 60 seconds to prevent memory leak
 */

class SocketRateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60 * 1000; // 1 minute
        this.maxRequests = options.maxRequests || 30; // 30 messages per minute
        this.userRequests = new Map(); // userId -> [timestamps]

        // Auto-cleanup to prevent memory leak
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, this.windowMs);

        console.log(`✓ Rate Limiter initialized (${this.maxRequests} req/${this.windowMs}ms)`);
    }

    /**
     * Check if user is within rate limit
     * @param {string} userId 
     * @returns {Object} { allowed: boolean, retryAfter: number }
     */
    checkLimit(userId) {
        const now = Date.now();
        const userTimestamps = this.userRequests.get(userId) || [];

        // Remove timestamps outside the window
        const validTimestamps = userTimestamps.filter(
            timestamp => now - timestamp < this.windowMs
        );

        // Check if user exceeded limit
        if (validTimestamps.length >= this.maxRequests) {
            const oldestTimestamp = validTimestamps[0];
            const retryAfter = Math.ceil((oldestTimestamp + this.windowMs - now) / 1000);

            return {
                allowed: false,
                retryAfter,
                current: validTimestamps.length,
                limit: this.maxRequests
            };
        }

        // Add current timestamp and update
        validTimestamps.push(now);
        this.userRequests.set(userId, validTimestamps);

        return {
            allowed: true,
            remaining: this.maxRequests - validTimestamps.length,
            limit: this.maxRequests
        };
    }

    /**
     * Cleanup expired entries to prevent memory leak
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [userId, timestamps] of this.userRequests.entries()) {
            const validTimestamps = timestamps.filter(
                timestamp => now - timestamp < this.windowMs
            );

            if (validTimestamps.length === 0) {
                this.userRequests.delete(userId);
                cleaned++;
            } else {
                this.userRequests.set(userId, validTimestamps);
            }
        }

        if (cleaned > 0) {
            console.log(`[RateLimiter] Cleaned ${cleaned} expired entries. Active users: ${this.userRequests.size}`);
        }
    }

    /**
     * Get current stats (for monitoring)
     */
    getStats() {
        return {
            activeUsers: this.userRequests.size,
            windowMs: this.windowMs,
            maxRequests: this.maxRequests
        };
    }

    /**
     * Cleanup on shutdown
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.userRequests.clear();
    }
}

// Singleton instance
const rateLimiter = new SocketRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30 // 30 messages per minute
});

export default rateLimiter;
