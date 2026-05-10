import mongoose from 'mongoose';

const repairSchema = new mongoose.Schema({
  // Device Information
  deviceName: {
    type: String,
    required: true
  },
  deviceModel: {
    type: String,
    default: ''
  },
  deviceBrand: {
    type: String,
    default: ''
  },
  serialNumber: {
    type: String,
    default: ''
  },
  
  // Issue Details
  issueType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  diagnosedBy: {
    type: String,
    default: 'Self'
  },
  diagnosisDate: {
    type: Date,
    default: Date.now
  },
  
  // Customer Information
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  customerAddress: {
    type: String,
    default: ''
  },
  
  // Financial Details
  estimatedCost: {
    type: Number,
    default: 0
  },
  finalCost: {
    type: Number,
    default: 0
  },
  advancePayment: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  
  // Payment Information
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partial', 'Completed', 'Refunded'],
    default: 'Pending'
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  
  // Repair Status
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Referred'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  
  // Short Code for easy searching (R1, R2, R3...)
  shortCode: {
    type: String,
    unique: true,
    sparse: true,
    default: ''
  },
  
  // Custom Fields - Dynamic fields for device specifications
  customFields: [{
    name: {
      type: String,
      default: ''
    },
    value: {
      type: String,
      default: ''
    },
    id: {
      type: String,
      default: ''
    }
  }],
  
  // Referral Information
  isReferred: {
    type: Boolean,
    default: false
  },
  referredTo: {
    name: String,
    shopName: String,
    city: String,
    address: String,
    phone: String,
    email: String
  },
  referralDate: Date,
  referralCost: Number,
  referralFee: Number,
  referralStatus: {
    type: String,
    enum: ['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  referralNotes: String,
  
  // Parts Used
  partsUsed: [{
    partName: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    supplier: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Technician Information
  technicianInfo: {
    name: String,
    employeeId: String,
    assignedDate: Date,
    completedDate: Date
  },
  
  // Enhanced Attachments - Support for images, documents, and videos
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['image', 'document', 'video'],
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      default: 0
    },
    thumbnail: {
      type: String,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    }
  }],
  
  // Notes
  notes: [{
    content: String,
    createdBy: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  repairId: {
    type: String,
    unique: true,
    sparse: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Function to generate unique repair ID
async function generateUniqueRepairId() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `RPR-${year}${month}`;
  
  const Repair = mongoose.model('Repair');
  
  const latestRepair = await Repair.findOne({
    repairId: { $regex: `^${prefix}` }
  }).sort({ repairId: -1 });
  
  let sequence = 1;
  if (latestRepair && latestRepair.repairId) {
    const lastSequence = parseInt(latestRepair.repairId.split('-')[2]);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  const sequenceStr = String(sequence).padStart(5, '0');
  return `${prefix}-${sequenceStr}`;
}

// Function to generate unique short code (R1, R2, R3...)
async function generateShortCode() {
  const Repair = mongoose.model('Repair');
  
  const latestRepair = await Repair.findOne({
    shortCode: { $regex: '^R\\d+$' }
  }).sort({ shortCode: -1 });
  
  let maxNumber = 0;
  if (latestRepair && latestRepair.shortCode) {
    const match = latestRepair.shortCode.match(/R(\d+)/);
    if (match) {
      maxNumber = parseInt(match[1]);
    }
  }
  
  const newNumber = maxNumber + 1;
  return `R${newNumber}`;
}

// Generate repair ID and short code before saving
repairSchema.pre('save', async function(next) {
  try {
    // Generate repairId if not exists
    if (!this.repairId) {
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (!isUnique && attempts < maxAttempts) {
        const newRepairId = await generateUniqueRepairId();
        const existingRepair = await mongoose.model('Repair').findOne({ repairId: newRepairId });
        
        if (!existingRepair) {
          this.repairId = newRepairId;
          isUnique = true;
        }
        attempts++;
      }
      
      if (!isUnique) {
        this.repairId = `RPR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }
    }
    
    // Generate shortCode if not exists
    if (!this.shortCode) {
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (!isUnique && attempts < maxAttempts) {
        const newShortCode = await generateShortCode();
        const existingRepair = await mongoose.model('Repair').findOne({ shortCode: newShortCode });
        
        if (!existingRepair) {
          this.shortCode = newShortCode;
          isUnique = true;
        }
        attempts++;
      }
      
      if (!isUnique) {
        this.shortCode = `R${Date.now()}`;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Create indexes
repairSchema.index({ createdAt: -1 });
repairSchema.index({ status: 1 });
repairSchema.index({ customerPhone: 1 });
repairSchema.index({ shortCode: 1 });
repairSchema.index({ repairId: 1 }, { unique: true, sparse: true });
repairSchema.index({ 'customFields.name': 1 });
repairSchema.index({ 'customFields.value': 1 });

const Repair = mongoose.model('Repair', repairSchema);
export default Repair;