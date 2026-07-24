const mongoose = require('mongoose');

const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'];

const InvitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['reviewer', 'writer'],
      required: [true, 'Role is required'],
    },
    token: {
      type: String,
      required: [true, 'Token is required'],
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: INVITATION_STATUSES,
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
InvitationSchema.index({ email: 1, status: 1 });
InvitationSchema.index({ expiresAt: 1 });

// Method to check if invitation is expired
InvitationSchema.methods.isExpired = function () {
  return this.expiresAt < new Date();
};

// Method to check if invitation is valid (pending and not expired)
InvitationSchema.methods.isValid = function () {
  return this.status === 'pending' && !this.isExpired();
};

module.exports = mongoose.model('Invitation', InvitationSchema);
