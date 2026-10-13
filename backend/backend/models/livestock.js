const mongoose = require('mongoose')

const livestockSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    farmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farm',
      default: null,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    species: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    tagId: {
      type: String,
      trim: true,
      maxlength: 80
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Livestock', livestockSchema)
