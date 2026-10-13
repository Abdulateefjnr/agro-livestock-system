const mongoose = require('mongoose')

const farmSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    sizeHectares: {
      type: Number,
      required: true,
      min: 0
    },
    farmType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    owner: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    cropAreaHectares: {
      type: Number,
      min: 0,
      default: 0
    },
    livestockAreaHectares: {
      type: Number,
      min: 0,
      default: 0
    },
    otherAreaHectares: {
      type: Number,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
      required: true
    }
  },
  { timestamps: true }
)

farmSchema.pre('validate', function validateFarmAreas() {
  const allocatedArea =
    this.cropAreaHectares + this.livestockAreaHectares + this.otherAreaHectares

  if (allocatedArea > this.sizeHectares) {
    this.invalidate('sizeHectares', 'Allocated areas cannot exceed total farm size')
  }
})

module.exports = mongoose.model('Farm', farmSchema)
