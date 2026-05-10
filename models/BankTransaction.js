import mongoose from 'mongoose';

const bankTransactionSchema = new mongoose.Schema({
  bankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank',
    required: true
  },
  transactionType: {
    type: String,
    enum: ['deposit', 'withdrawal', 'payment_received', 'payment_sent', 'expense', 'transfer_in', 'transfer_out', 'adjustment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  previousBalance: {
    type: Number,
    required: true
  },
  newBalance: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  referenceId: {
    type: String,
    default: ''
  },
  referenceType: {
    type: String,
    enum: ['repair', 'expense', 'transfer', 'salary', 'purchase', 'other'],
    default: 'other'
  },
  paymentMethod: {
    type: String,
    default: 'Bank Transfer'
  },
  transactionId: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'failed'],
    default: 'completed'
  },
  transactionDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for better performance
bankTransactionSchema.index({ bankId: 1, transactionDate: -1 });
bankTransactionSchema.index({ transactionType: 1 });
bankTransactionSchema.index({ referenceId: 1 });

const BankTransaction = mongoose.model('BankTransaction', bankTransactionSchema);
export default BankTransaction;