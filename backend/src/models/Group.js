import mongoose from 'mongoose';

/**
 * Group Model - Manages group chat entities
 * 
 * Design decisions:
 * - Max 100 members per group
 * - Admins can delete member messages
 * - AI responses are public in the group
 */

const groupSettingsSchema = new mongoose.Schema({
    aiEnabled: {
        type: Boolean,
        default: true
    },
    muteNotifications: {
        type: Boolean,
        default: false
    },
    onlyAdminsCanPost: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    avatarUrl: {
        type: String,
        default: null
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    inviteCode: {
        type: String,
        unique: true,
        sparse: true
    },
    pinnedMessages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }],
    settings: {
        type: groupSettingsSchema,
        default: () => ({})
    },
    // Per-user wallpaper preferences (same pattern as Conversation)
    wallpapers: {
        type: Map,
        of: new mongoose.Schema({
            sourceType: { type: String, enum: ['preset', 'custom', 'none'], default: 'none' },
            presetKey: { type: String, default: 'aurora' },
            imageUrl: { type: String, default: '' },
            blur: { type: Number, default: 6, min: 0, max: 48 },
            opacity: { type: Number, default: 0.9, min: 0, max: 1 }
        }, { _id: false }),
        default: {}
    },
    lastMessageAt: {
        type: Date,
        default: null
    },
    lastMessagePreview: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    collection: 'groups'
});

// Indexes for scalability
groupSchema.index({ creator: 1 });
groupSchema.index({ members: 1 });
groupSchema.index({ admins: 1 });
groupSchema.index({ inviteCode: 1 }, { unique: true, sparse: true });
groupSchema.index({ updatedAt: -1 });

// Virtual for member count
groupSchema.virtual('memberCount').get(function () {
    return this.members?.length || 0;
});

// Constants
groupSchema.statics.MAX_MEMBERS = 100;

// Check if user is member (handles both populated User objects and ObjectIds)
groupSchema.methods.isMember = function (userId) {
    const id = userId.toString();
    return this.members.some(m => {
        const memberId = m._id ? m._id.toString() : m.toString();
        return memberId === id;
    });
};

// Check if user is admin (handles both populated User objects and ObjectIds)
groupSchema.methods.isAdmin = function (userId) {
    const id = userId.toString();
    const isInAdmins = this.admins.some(a => {
        const adminId = a._id ? a._id.toString() : a.toString();
        return adminId === id;
    });
    const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
    return isInAdmins || creatorId === id;
};

// Check if user is creator (handles both populated User objects and ObjectIds)
groupSchema.methods.isCreator = function (userId) {
    const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
    return creatorId === userId.toString();
};

// Generate unique invite code
groupSchema.statics.generateInviteCode = function () {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

const Group = mongoose.model('Group', groupSchema);

export default Group;
