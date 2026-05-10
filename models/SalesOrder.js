import mongoose from 'mongoose';

const salesOrderSchema = new mongoose.Schema({
  soNumber: {
    type: String,
    unique: true,
    sparse: true  // Add this to allow null/undefined during save
  },
  customer: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String,
    sku: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    sellingPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true
    }
  }],
  subtotal: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  discountType: {
    type: String,
    enum: ['Percentage', 'Fixed'],
    default: 'Fixed'
  },
  tax: {
    type: Number,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partial', 'Paid', 'Refunded'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque'],
    default: 'Cash'
  },
  bankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bank'
  },
  bankName: String,
  transactionId: {
    type: String,
    default: ''
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'],
    default: 'Pending'
  },
  notes: {
    type: String,
    default: ''
  },
  attachments: [{
    filename: String,
    url: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate SO number before saving - FIXED VERSION
salesOrderSchema.pre('save', async function(next) {
  try {
    // Only generate if soNumber doesn't exist
    if (!this.soNumber) {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const SalesOrder = mongoose.model('SalesOrder');
      
      // Get the count of documents to generate sequence number
      const count = await SalesOrder.countDocuments();
      const sequence = String(count + 1).padStart(5, '0');
      this.soNumber = `SO-${year}${month}-${sequence}`;
    }
    next();
  } catch (error) {
    console.error('Error generating SO number:', error);
    next(error);
  }
});

// Create indexes
salesOrderSchema.index({ soNumber: 1 }, { unique: true, sparse: true });
salesOrderSchema.index({ orderDate: -1 });
salesOrderSchema.index({ status: 1 });
salesOrderSchema.index({ paymentStatus: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;