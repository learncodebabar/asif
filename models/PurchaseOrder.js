import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    unique: true,
    default: function() {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `PO-${year}${month}-${random}`;
    }
  },
  supplier: {
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    purchasePrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true }
  }],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['Fixed', 'Percentage'], default: 'Fixed' },
  tax: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque'],
    default: 'Cash' 
  },
  bankId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bank', 
    default: null 
  },
  bankName: { type: String, default: '' },
  transactionId: { type: String, default: '' },
  status: { 
    type: String, 
    enum: ['Draft', 'Ordered', 'Partial Received', 'Completed', 'Cancelled'],
    default: 'Ordered'
  },
  orderDate: { type: Date, default: Date.now },
  expectedDeliveryDate: { type: Date },
  receivedDate: { type: Date },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Generate PO number before saving
purchaseSchema.pre('save', async function(next) {
  if (!this.poNumber || this.poNumber === 'PO-YYYYMM-0000') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const prefix = `PO-${year}${month}`;
    
    const Purchase = mongoose.model('Purchase');
    const lastPurchase = await Purchase.findOne({
      poNumber: { $regex: `^${prefix}` }
    }).sort({ poNumber: -1 });
    
    let sequence = 1;
    if (lastPurchase && lastPurchase.poNumber) {
      const parts = lastPurchase.poNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2]);
        if (!isNaN(lastSeq)) sequence = lastSeq + 1;
      }
    }
    
    this.poNumber = `${prefix}-${String(sequence).padStart(4, '0')}`;
  }
  next();
});

// Calculate remaining amount before saving
purchaseSchema.pre('save', function(next) {
  this.remainingAmount = this.totalAmount - this.amountPaid;
  next();
});

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;