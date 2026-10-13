const mongoose = require('mongoose')

const inventorySchema = new mongoose.Schema(
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
      maxlength: 120
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    quantity: {
      type: Number,
      min: 0,
      required: true
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },
    reorderLevel: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Inventory', inventorySchema)
