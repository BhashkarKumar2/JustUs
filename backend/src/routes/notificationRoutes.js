import express from 'express';
import Subscription from '../models/Subscription.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/notifications/subscribe
 * @desc    Subscribe to push notifications
 * @access  Private
 */
router.post('/subscribe', authenticateJWT, async (req, res) => {
    try {
        const subscription = req.body;
        const userId = req.userId; // auth middleware sets req.userId
        const userAgent = req.headers['user-agent'];

        // Upsert subscription
        await Subscription.findOneAndUpdate(
            { userId, 'subscription.endpoint': subscription.endpoint },
            { userId, subscription, userAgent },
            { upsert: true, new: true }
        );

        res.status(201).json({ success: true, message: 'Subscribed successfully' });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * @route   POST /api/notifications/unsubscribe
 * @desc    Unsubscribe from push notifications
 * @access  Private
 */
router.post('/unsubscribe', authenticateJWT, async (req, res) => {
    try {
        const { endpoint } = req.body;
        const userId = req.userId;

        await Subscription.findOneAndDelete({ userId, 'subscription.endpoint': endpoint });

        res.status(200).json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
