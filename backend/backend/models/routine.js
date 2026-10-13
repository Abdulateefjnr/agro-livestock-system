const mongoose = require('mongoose')

const routineSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    clientId: {
      type: String,
      trim: true,
      maxlength: 80
    },
    farmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Farm',
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    type: {
      type: String,
      enum: ['Feeding', 'Vaccination', 'Irrigation', 'Fertilizing', 'Planting', 'Harvesting', 'Other'],
      required: true
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    repeat: {
      type: String,
      enum: ['Does not repeat', 'Daily', 'Weekly', 'Monthly'],
      default: 'Does not repeat',
      required: true
    },
    completed: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  { timestamps: true }
)

routineSchema.index(
  { userId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
)

module.exports = mongoose.model('Routine', routineSchema)
