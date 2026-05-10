import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    unique: true,
    required: true
  },
  barcode: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: true,
    enum: ['Electronics', 'Accessories', 'Parts', 'Tools', 'Consumables', 'Other']
  },
  brand: {
    type: String,
    default: ''
  },
  model: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  unit: {
    type: String,
    enum: ['Piece', 'Set', 'Box', 'KG', 'Meter', 'Liter'],
    default: 'Piece'
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  mrp: {
    type: Number,
    min: 0
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  minStockLevel: {
    type: Number,
    default: 0,
    description: 'Minimum stock level for alerts'
  },
  maxStockLevel: {
    type: Number,
    default: 0,
    description: 'Maximum stock level'
  },
  location: {
    type: String,
    default: '',
    description: 'Storage location (shelf, rack, etc.)'
  },
  supplier: {
    type: String,
    default: ''
  },
  warrantyPeriod: {
    type: Number,
    default: 0,
    description: 'Warranty period in months'
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Discontinued'],
    default: 'Active'
  },
  images: [{
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

// Generate SKU before saving
productSchema.pre('save', async function(next) {
  if (!this.sku) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const Product = mongoose.model('Product');
    const count = await Product.countDocuments();
    this.sku = `SKU-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Create indexes
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;