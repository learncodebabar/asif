import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  repairId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repair',
    required: true
  },
  referredTo: {
    shopName: { 
      type: String, 
      required: true 
    },
    ownerName: { 
      type: String, 
      required: true 
    },
    city: { 
      type: String, 
      required: true 
    },
    address: { 
      type: String, 
      required: true 
    },
    phone: { 
      type: String, 
      required: true 
    },
    email: { 
      type: String 
    },
    website: { 
      type: String 
    }
  },
  referralDate: {
    type: Date,
    default: Date.now
  },
  estimatedCost: {
    type: Number,
    default: 0
  },
  finalCost: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 0
  },
  commissionType: {
    type: String,
    enum: ['Percentage', 'Fixed'],
    default: 'Percentage'
  },
  commissionValue: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  externalRepairId: {
    type: String
  },
  expectedCompletionDate: {
    type: Date
  },
  actualCompletionDate: {
    type: Date
  },
  notes: {
    type: String
  },
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate referral ID before saving
referralSchema.pre('save', async function(next) {
  if (!this.referralId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const Referral = mongoose.model('Referral');
    const count = await Referral.countDocuments();
    this.referralId = `REF-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Calculate commission before saving
referralSchema.pre('save', function(next) {
  if (this.commissionType === 'Percentage' && this.commissionValue) {
    this.commission = (this.estimatedCost * this.commissionValue) / 100;
  } else if (this.commissionType === 'Fixed') {
    this.commission = this.commissionValue;
  }
  next();
});

const Referral = mongoose.model('Referral', referralSchema);
export default Referral; 