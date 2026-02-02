import { GoogleGenerativeAI } from '@google/generative-ai';
import Message from '../models/Message.js';
import Group from '../models/Group.js';
import User from '../models/User.js';

/**
 * Group AI Service - AI features for group chats
 * Handles @AI mentions and group-specific AI capabilities
 */
class GroupAIService {
    constructor() {
        this.genAI = null;
        this.initialized = false;
        this.systemPrompt = `You are an AI assistant for a group chat in JustUs messenger.
Your role is to help group members with:
- Summarizing group discussions
- Answering questions about past conversations
- Extracting action items and decisions
- Providing helpful information
- Translating messages

Keep responses concise and helpful. Format with markdown when appropriate.
Always be respectful and professional.`;
    }

    _initialize() {
        if (this.initialized) {
            return this.genAI !== null;
        }

        this.initialized = true;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.warn('⚠️  GEMINI_API_KEY not set. Group AI features will be disabled.');
            this.genAI = null;
            return false;
        }

        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            console.log('✓ Group AI Service initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Group AI Service:', error.message);
            this.genAI = null;
            return false;
        }
    }

    get enabled() {
        return this._initialize();
    }

    /**
     * Check if message contains @AI mention
     * @param {string} text - Message text
     * @returns {boolean}
     */
    hasAIMention(text) {
        if (!text || typeof text !== 'string') return false;
        return /@AI\b/i.test(text);
    }

    /**
     * Extract the query after @AI mention
     * @param {string} text - Message text
     * @returns {string} - Query without @AI prefix
     */
    extractAIQuery(text) {
        if (!this.hasAIMention(text)) return text;
        return text.replace(/@AI\s*/i, '').trim();
    }

    /**
     * Parse all mentions in a message
     * @param {string} text - Message text
     * @param {Array} groupMembers - Array of group member objects with _id and username
     * @returns {Array} - Array of mention objects
     */
    parseMentions(text, groupMembers = []) {
        const mentions = [];

        // Check for @AI
        if (this.hasAIMention(text)) {
            mentions.push({ type: 'ai', displayName: 'AI' });
        }

        // Check for @username mentions
        const usernamePattern = /@(\w+)/g;
        let match;
        while ((match = usernamePattern.exec(text)) !== null) {
            const username = match[1].toLowerCase();
            if (username === 'ai') continue; // Already handled

            const member = groupMembers.find(m =>
                m.username?.toLowerCase() === username ||
                m.displayName?.toLowerCase() === username
            );

            if (member) {
                mentions.push({
                    type: 'user',
                    userId: member._id,
                    displayName: member.displayName || member.username
                });
            }
        }

        return mentions;
    }

    /**
     * Summarize recent group chat messages
     * @param {string} groupId - Group ID
     * @param {number} hours - Hours of history to summarize (default: 24)
     * @returns {Promise<Object>}
     */
    async summarizeGroupChat(groupId, hours = 24) {
        if (!this.enabled) {
            return { success: false, error: 'AI service unavailable' };
        }

        try {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            const messages = await Message.find({
                groupId,
                timestamp: { $gte: since },
                deleted: false,
                type: 'text'
            })
                .sort({ timestamp: 1 })
                .limit(200);

            if (messages.length === 0) {
                return {
                    success: true,
                    response: `No messages found in the last ${hours} hours.`
                };
            }

            // Get sender names
            const senderIds = [...new Set(messages.map(m => m.senderId))];
            const users = await User.find({ _id: { $in: senderIds } });
            const userMap = {};
            users.forEach(u => {
                userMap[u._id.toString()] = u.displayName || u.username;
            });

            // Format messages for AI
            const formattedMessages = messages.map(m => {
                const senderName = userMap[m.senderId] || 'Unknown';
                const time = new Date(m.timestamp).toLocaleTimeString();
                return `[${time}] ${senderName}: ${m.content}`;
            }).join('\n');

            const prompt = `${this.systemPrompt}

Please summarize the following group chat discussion. Focus on:
1. Main topics discussed
2. Key decisions made
3. Action items or tasks mentioned
4. Any unresolved questions

Chat History (last ${hours} hours):
${formattedMessages}

Provide a concise summary:`;

            const model = this.genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash'
            });
            const result = await model.generateContent(prompt);
            const response = result.response.text();

            return { success: true, response };
        } catch (error) {
            console.error('Group summarize error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Answer a question about the group chat
     * @param {string} query - User's question
     * @param {string} groupId - Group ID
     * @returns {Promise<Object>}
     */
    async answerQuestion(query, groupId) {
        if (!this.enabled) {
            return { success: false, error: 'AI service unavailable' };
        }

        try {
            // Get recent messages for context
            const messages = await Message.find({
                groupId,
                deleted: false,
                type: 'text'
            })
                .sort({ timestamp: -1 })
                .limit(100);

            // Get sender names
            const senderIds = [...new Set(messages.map(m => m.senderId))];
            const users = await User.find({ _id: { $in: senderIds } });
            const userMap = {};
            users.forEach(u => {
                userMap[u._id.toString()] = u.displayName || u.username;
            });

            // Format messages for AI (reverse to chronological)
            const formattedMessages = messages.reverse().map(m => {
                const senderName = userMap[m.senderId] || 'Unknown';
                return `${senderName}: ${m.content}`;
            }).join('\n');

            const prompt = `${this.systemPrompt}

Based on the following group chat context, please answer this question:
"${query}"

Chat Context:
${formattedMessages}

Answer concisely:`;

            const model = this.genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash'
            });
            const result = await model.generateContent(prompt);
            const response = result.response.text();

            return { success: true, response };
        } catch (error) {
            console.error('Group AI answer error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract action items from recent messages
     * @param {string} groupId - Group ID
     * @returns {Promise<Object>}
     */
    async extractActionItems(groupId) {
        if (!this.enabled) {
            return { success: false, error: 'AI service unavailable' };
        }

        try {
            const messages = await Message.find({
                groupId,
                deleted: false,
                type: 'text'
            })
                .sort({ timestamp: -1 })
                .limit(100);

            if (messages.length === 0) {
                return { success: true, response: 'No messages to analyze.' };
            }

            const senderIds = [...new Set(messages.map(m => m.senderId))];
            const users = await User.find({ _id: { $in: senderIds } });
            const userMap = {};
            users.forEach(u => {
                userMap[u._id.toString()] = u.displayName || u.username;
            });

            const formattedMessages = messages.reverse().map(m => {
                const senderName = userMap[m.senderId] || 'Unknown';
                return `${senderName}: ${m.content}`;
            }).join('\n');

            const prompt = `${this.systemPrompt}

Please extract action items, tasks, and decisions from the following group chat.
Format as a bullet list with the responsible person if mentioned.

Chat:
${formattedMessages}

Action Items:`;

            const model = this.genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash'
            });
            const result = await model.generateContent(prompt);
            const response = result.response.text();

            return { success: true, response };
        } catch (error) {
            console.error('Extract action items error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle @AI mention in group
     * @param {string} query - User's message with @AI removed
     * @param {string} groupId - Group ID
     * @param {Object} context - Additional context (sender info, etc)
     * @returns {Promise<Object>}
     */
    async handleAIMention(query, groupId, context = {}) {
        if (!this.enabled) {
            return {
                success: false,
                error: 'AI service unavailable',
                response: "Sorry, I'm currently unavailable. The AI service is not configured."
            };
        }

        const normalizedQuery = query.toLowerCase().trim();

        // Handle special commands
        if (normalizedQuery === 'help' || normalizedQuery === '/help') {
            return {
                success: true,
                response: this.getHelpText()
            };
        }

        if (normalizedQuery.startsWith('summarize') || normalizedQuery.startsWith('summary')) {
            const hours = this.extractHours(normalizedQuery) || 24;
            return await this.summarizeGroupChat(groupId, hours);
        }

        if (normalizedQuery.startsWith('action items') || normalizedQuery.startsWith('tasks')) {
            return await this.extractActionItems(groupId);
        }

        // Default: answer as a question
        return await this.answerQuestion(query, groupId);
    }

    /**
     * Extract hours from query like "summarize last 6 hours"
     */
    extractHours(query) {
        const match = query.match(/(\d+)\s*(hour|hr)/i);
        return match ? parseInt(match[1]) : null;
    }

    getHelpText() {
        return `🤖 **Group AI Assistant Help**

Tag me with **@AI** followed by your request!

**Commands:**
• \`@AI summarize\` - Summarize recent chat (last 24h)
• \`@AI summarize last 6 hours\` - Summarize specific timeframe
• \`@AI action items\` - Extract tasks and decisions
• \`@AI [your question]\` - Ask about the chat

**Examples:**
• @AI What did we decide about the project deadline?
• @AI Who was supposed to handle the design?
• @AI summarize last 2 hours

I'm here to help! 😊`;
    }
}

export default new GroupAIService();
