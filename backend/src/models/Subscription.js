import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Compound index to prevent duplicate subscriptions for same user/device
subscriptionSchema.index({ userId: 1, "subscription.endpoint": 1 }, { unique: true });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
