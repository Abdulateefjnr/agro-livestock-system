const mongoose = require('mongoose')

const activitySchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    action: {
      type: String,
      required: true,
      maxlength: 100
    },
    entityType: {
      type: String,
      required: true,
      maxlength: 40
    },
    entityId: {
      type: String,
      default: ''
    },
    details: {
      type: String,
      default: '',
      maxlength: 240
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Activity', activitySchema)
