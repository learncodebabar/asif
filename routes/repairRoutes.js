import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Repair from '../models/Repair.js';
import Payment from '../models/Payment.js';
import Referral from '../models/Referral.js';
import Bank from '../models/Bank.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== FILE UPLOAD CONFIGURATION ====================
const uploadDir = path.join(__dirname, '../uploads');
const imageDir = path.join(uploadDir, 'repair-images');
const documentDir = path.join(uploadDir, 'documents');
const videoDir = path.join(uploadDir, 'videos');

[uploadDir, imageDir, documentDir, videoDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf', 
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`), false);
    }
  }
});

// ==================== HELPER FUNCTIONS ====================
const getFileType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
};

const saveAttachment = (file, uploadedBy = '') => {
  if (!file) return null;
  
  try {
    const fileType = getFileType(file.mimetype);
    let targetDir;
    
    switch(fileType) {
      case 'image':
        targetDir = imageDir;
        break;
      case 'video':
        targetDir = videoDir;
        break;
      default:
        targetDir = documentDir;
    }
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeFilename = uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filepath = path.join(targetDir, safeFilename);
    
    if (file.buffer) {
      fs.writeFileSync(filepath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, filepath);
    }
    
    let urlPath;
    if (fileType === 'image') {
      urlPath = `/uploads/repair-images/${safeFilename}`;
    } else if (fileType === 'video') {
      urlPath = `/uploads/videos/${safeFilename}`;
    } else {
      urlPath = `/uploads/documents/${safeFilename}`;
    }
    
    return {
      filename: safeFilename,
      originalName: file.originalname,
      url: urlPath,
      fileType: fileType,
      mimeType: file.mimetype,
      fileSize: file.size || 0,
      uploadedAt: new Date(),
      uploadedBy: uploadedBy,
      description: ''
    };
  } catch (error) {
    console.error("Error saving attachment:", error);
    return null;
  }
};

// ==================== REPAIR ROUTES ====================

// Get all repairs with filters
router.get('/', async (req, res) => {
  try {
    const { status, search, startDate, endDate } = req.query;
    let query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { repairId: { $regex: search, $options: 'i' } },
        { shortCode: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { deviceName: { $regex: search, $options: 'i' } },
        { issueType: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'customFields.name': { $regex: search, $options: 'i' } },
        { 'customFields.value': { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const repairs = await Repair.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: repairs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single repair
router.get('/:id', async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get repair by short code
router.get('/shortcode/:code', async (req, res) => {
  try {
    const repair = await Repair.findOne({ shortCode: req.params.code });
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new repair
router.post('/',
  upload.array('attachments', 10),
  [
    body('deviceName').notEmpty().withMessage('Device name is required'),
    body('customerName').notEmpty().withMessage('Customer name is required'),
    body('customerPhone').notEmpty().withMessage('Customer phone is required'),
    body('issueType').notEmpty().withMessage('Issue type is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      let repairData = req.body;
      
      // Parse custom fields if sent as JSON string
      if (repairData.customFields && typeof repairData.customFields === 'string') {
        try {
          repairData.customFields = JSON.parse(repairData.customFields);
        } catch (e) {
          console.error('Error parsing customFields:', e);
          repairData.customFields = [];
        }
      }
      
      if (!repairData.customFields || !Array.isArray(repairData.customFields)) {
        repairData.customFields = [];
      }
      
      // Process attachments
      let attachments = [];
      if (req.files && req.files.length > 0) {
        attachments = req.files.map(file => saveAttachment(file, repairData.createdBy || 'System'));
        attachments = attachments.filter(att => att !== null);
      }
      
      if (attachments.length > 0) {
        repairData.attachments = attachments;
      }
      
      const repair = new Repair(repairData);
      await repair.save();
      res.status(201).json({ success: true, data: repair });
    } catch (error) {
      console.error('Error creating repair:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Update repair
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  try {
    let updateData = req.body;
    
    if (updateData.customFields && typeof updateData.customFields === 'string') {
      try {
        updateData.customFields = JSON.parse(updateData.customFields);
      } catch (e) {
        console.error('Error parsing customFields:', e);
        updateData.customFields = [];
      }
    }
    
    if (req.files && req.files.length > 0) {
      const existingRepair = await Repair.findById(req.params.id);
      let existingAttachments = existingRepair?.attachments || [];
      const newAttachments = req.files.map(file => saveAttachment(file, updateData.updatedBy || 'System'));
      const validAttachments = newAttachments.filter(att => att !== null);
      updateData.attachments = [...existingAttachments, ...validAttachments];
    }
    
    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete repair
router.delete('/:id', async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    if (repair.attachments && repair.attachments.length > 0) {
      repair.attachments.forEach(attachment => {
        const filePath = path.join(__dirname, '..', attachment.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    await Payment.deleteMany({ repairId: req.params.id });
    await Referral.deleteMany({ repairId: req.params.id });
    await Repair.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: 'Repair deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== ATTACHMENT ROUTES ====================

router.post('/:id/attachments', upload.single('attachment'), async (req, res) => {
  try {
    const { id } = req.params;
    const { description, uploadedBy } = req.body;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const attachment = saveAttachment(req.file, uploadedBy || 'System');
    if (attachment) {
      attachment.description = description || '';
      repair.attachments.push(attachment);
      await repair.save();
    }
    
    res.json({
      success: true,
      message: 'Attachment added successfully',
      data: repair
    });
  } catch (error) {
    console.error("Add attachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    
    const attachment = repair.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }
    
    const filePath = path.join(__dirname, '..', attachment.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    attachment.deleteOne();
    await repair.save();
    
    res.json({
      success: true,
      message: 'Attachment deleted successfully',
      data: repair
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id/attachments', async (req, res) => {
  try {
    const { id } = req.params;
    const repair = await Repair.findById(id).select('attachments');
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair.attachments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PAYMENT ROUTES ====================

router.post('/:id/payments',
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('paymentMethod').isIn(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']).withMessage('Invalid payment method')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { amount, paymentMethod, bankId, transactionId, remarks } = req.body;
      const repair = await Repair.findById(req.params.id);
      
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      const paymentRecord = new Payment({
        repairId: repair._id,
        amount,
        paymentMethod,
        bankId: paymentMethod === 'Bank Transfer' ? bankId : null,
        transactionId,
        remarks,
        status: 'Completed'
      });
      await paymentRecord.save();

      repair.totalPaid = (repair.totalPaid || 0) + amount;
      
      if (repair.totalPaid >= repair.estimatedCost) {
        repair.paymentStatus = 'Completed';
      } else if (repair.totalPaid > 0) {
        repair.paymentStatus = 'Partial';
      }

      repair.remainingAmount = repair.estimatedCost - repair.totalPaid;
      await repair.save();

      if (paymentMethod === 'Bank Transfer' && bankId) {
        const bank = await Bank.findById(bankId);
        if (bank) {
          bank.currentBalance = (bank.currentBalance || 0) + amount;
          await bank.save();
        }
      }

      const updatedRepair = await Repair.findById(repair._id);
      res.json({ success: true, data: updatedRepair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// ==================== REFERRAL ROUTES ====================

router.post('/:id/refer',
  [
    body('referredTo.shopName').notEmpty().withMessage('Shop name is required'),
    body('referredTo.ownerName').notEmpty().withMessage('Owner name is required'),
    body('referredTo.phone').notEmpty().withMessage('Phone number is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      const referral = new Referral({
        repairId: repair._id,
        referredTo: req.body.referredTo,
        estimatedCost: req.body.estimatedCost || 0,
        commission: req.body.commission || 0,
        commissionType: req.body.commissionType || 'Percentage',
        commissionValue: req.body.commissionValue || 0,
        notes: req.body.notes,
        status: 'Pending'
      });
      await referral.save();

      repair.isReferred = true;
      repair.referredTo = req.body.referredTo;
      repair.referralDate = new Date();
      repair.referralCost = req.body.estimatedCost || 0;
      repair.referralFee = req.body.commission || 0;
      repair.referralStatus = 'Pending';
      repair.referralNotes = req.body.notes;
      repair.status = 'Referred';

      await repair.save();

      const updatedRepair = await Repair.findById(repair._id);
      res.json({ success: true, data: updatedRepair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

router.patch('/:id/referral/status', async (req, res) => {
  try {
    const { status, externalRepairId, finalCost } = req.body;
    const repair = await Repair.findById(req.params.id);
    
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    repair.referralStatus = status;
    if (externalRepairId) repair.externalRepairId = externalRepairId;
    if (finalCost) repair.referralCost = finalCost;

    if (status === 'Completed') {
      repair.status = 'Completed';
      repair.referralStatus = 'Completed';
    }

    await repair.save();

    await Referral.findOneAndUpdate(
      { repairId: repair._id },
      { status, externalRepairId, finalCost }
    );

    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== PARTS ROUTES ====================

router.post('/:id/parts',
  [
    body('parts').isArray().withMessage('Parts must be an array')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      repair.partsUsed.push(...req.body.parts);
      
      const partsTotal = repair.partsUsed.reduce((sum, part) => sum + (part.totalPrice || 0), 0);
      repair.finalCost = partsTotal + (repair.estimatedCost || 0);
      repair.remainingAmount = repair.finalCost - (repair.totalPaid || 0);

      await repair.save();
      res.json({ success: true, data: repair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// ==================== NOTES ROUTES ====================

router.post('/:id/notes',
  [
    body('content').notEmpty().withMessage('Note content is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      repair.notes.push({
        content: req.body.content,
        createdBy: req.body.createdBy || 'System',
        createdAt: new Date()
      });

      await repair.save();
      res.json({ success: true, data: repair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// ==================== CUSTOM FIELDS ROUTES ====================

router.get('/:id/custom-fields', async (req, res) => {
  try {
    const { id } = req.params;
    const repair = await Repair.findById(id).select('customFields');
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair.customFields });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id/custom-fields', async (req, res) => {
  try {
    const { id } = req.params;
    const { customFields } = req.body;
    
    const repair = await Repair.findByIdAndUpdate(
      id,
      { customFields },
      { new: true, runValidators: true }
    );
    
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    
    res.json({ success: true, data: repair.customFields });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== STATISTICS ROUTES ====================

router.get('/stats/summary', async (req, res) => {
  try {
    const totalRepairs = await Repair.countDocuments();
    const completedRepairs = await Repair.countDocuments({ status: 'Completed' });
    const pendingRepairs = await Repair.countDocuments({ status: 'Pending' });
    const inProgressRepairs = await Repair.countDocuments({ status: 'In Progress' });
    const referredRepairs = await Repair.countDocuments({ isReferred: true });
    const cancelledRepairs = await Repair.countDocuments({ status: 'Cancelled' });
    
    const totalRevenue = await Repair.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$finalCost' } } }
    ]);
    
    const totalPayments = await Repair.aggregate([
      { $group: { _id: null, total: { $sum: '$totalPaid' } } }
    ]);

    const repairsByPriority = await Repair.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        totalRepairs,
        completedRepairs,
        pendingRepairs,
        inProgressRepairs,
        referredRepairs,
        cancelledRepairs,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalPayments: totalPayments[0]?.total || 0,
        repairsByPriority
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stats/date-range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const repairs = await Repair.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).sort({ createdAt: 1 });

    const totalAmount = repairs.reduce((sum, repair) => sum + (repair.finalCost || 0), 0);
    const totalPaid = repairs.reduce((sum, repair) => sum + (repair.totalPaid || 0), 0);

    res.json({
      success: true,
      data: {
        repairs,
        summary: {
          count: repairs.length,
          totalAmount,
          totalPaid,
          pendingAmount: totalAmount - totalPaid
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;