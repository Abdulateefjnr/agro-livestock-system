const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: ''
    },
    role: {
      type: String,
      enum: ['admin', 'manager', 'livestock_officer', 'crop_officer', 'accountant', 'staff'],
      default: 'staff',
      required: true
    },
    assignedFarmIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farm'
    }],
    farmAssignmentsConfigured: {
      type: Boolean,
      default: false
    },
    profilePicture: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'suspended'],
      default: 'active',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true
    },

    password: {
      type: String,
      required: true
    },
    lastLoginAt: {
      type: Date
    },
    sessionVersion: {
      type: Number,
      default: 0
    },
    passwordResetToken: {
      type: String,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      select: false
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('User', userSchema)