import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiryDate: Date,
    revoked: { type: Boolean, default: false },
    replacedByToken: { type: String, default: null }
}, { timestamps: true });

// Indexes for scalability
refreshTokenSchema.index({ token: 1 }); // Fast token lookup
refreshTokenSchema.index({ user: 1 }); // Fast user token lookup
refreshTokenSchema.index({ expiryDate: 1 }, { expireAfterSeconds: 0 }); // TTL: Auto-delete expired tokens

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
