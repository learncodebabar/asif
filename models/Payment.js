import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  repairId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repair',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']
  },
  bankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank',
    required: function() {
      return this.paymentMethod === 'Bank Transfer';
    }
  },
  transactionId: {
    type: String,
    default: ''
  },
  chequeNumber: {
    type: String,
    default: ''
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Completed'
  },
  refundedAt: {
    type: Date
  },
  refundReason: {
    type: String
  },
  remarks: {
    type: String
  },
  receiptNumber: {
    type: String,
    unique: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate receipt number before saving
paymentSchema.pre('save', async function(next) {
  if (!this.receiptNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const count = await mongoose.model('Payment').countDocuments();
    this.receiptNumber = `RCP-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;