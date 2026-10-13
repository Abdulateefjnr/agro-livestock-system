const mongoose = require('mongoose')

const expenseSchema = new mongoose.Schema(
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
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    amount: {
      type: Number,
      min: 0,
      required: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { timestamps: true }
)

module.exports = mongoose.model('Expense', expenseSchema)
