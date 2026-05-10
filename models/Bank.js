import mongoose from "mongoose";

const bankSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Personal', 'Business', 'Savings', 'Current'],
    default: 'Personal'
  },
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  accountTitle: {
    type: String,
    required: true
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true
  },
  branchCode: {
    type: String,
    default: ''
  },
  ibanNumber: {
    type: String,
    default: ''
  },
  swiftCode: {
    type: String,
    default: ''
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  }
}, {
  timestamps: true
});

const Bank = mongoose.model('Bank', bankSchema);
export default Bank;