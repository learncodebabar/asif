import Repair from "../models/Repair.js";
import Bank from "../models/Bank.js";
import PaymentHistory from "../models/PaymentHistory.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create upload directories for different file types
const uploadDir = path.join(__dirname, '../uploads');
const imageDir = path.join(uploadDir, 'repair-images');
const documentDir = path.join(uploadDir, 'documents');
const videoDir = path.join(uploadDir, 'videos');

// Ensure all directories exist
[uploadDir, imageDir, documentDir, videoDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper function to determine file type
const getFileType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
};

// Save attachment with proper categorization (supports images, docs, videos)
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
    
    // Save file
    if (file.buffer) {
      fs.writeFileSync(filepath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, filepath);
    }
    
    // Generate URL path
    let urlPath;
    if (fileType === 'image') {
      urlPath = `/uploads/repair-images/${safeFilename}`;
    } else if (fileType === 'video') {
      urlPath = `/uploads/videos/${safeFilename}`;
    } else {
      urlPath = `/uploads/documents/${safeFilename}`;
    }
    
    // Generate thumbnail for videos
    let thumbnail = '';
    if (fileType === 'video') {
      thumbnail = '/uploads/icons/video-placeholder.png';
    } else if (fileType === 'image') {
      thumbnail = urlPath; // Use the image itself as thumbnail
    }
    
    return {
      filename: safeFilename,
      originalName: file.originalname,
      url: urlPath,
      fileType: fileType,
      mimeType: file.mimetype,
      fileSize: file.size || 0,
      thumbnail: thumbnail,
      uploadedAt: new Date(),
      uploadedBy: uploadedBy,
      description: ''
    };
  } catch (error) {
    console.error("Error saving attachment:", error);
    return null;
  }
};

// Save image locally (backward compatibility)
const saveImage = (file) => {
  if (!file) return "";
  
  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'repair-' + uniqueSuffix + path.extname(file.originalname);
    const filepath = path.join(imageDir, filename);
    
    if (file.buffer) {
      fs.writeFileSync(filepath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, filepath);
    }
    
    return `/uploads/repair-images/${filename}`;
  } catch (error) {
    console.error("Error saving image:", error);
    return "";
  }
};

// Update bank balance
const updateBankBalance = async (bankId, amount, type = 'increase') => {
  try {
    const bank = await Bank.findById(bankId);
    if (bank) {
      if (type === 'increase') {
        bank.currentBalance = (bank.currentBalance || 0) + amount;
        console.log(`💰 Payment received: +${amount} to ${bank.bankName || bank.name}`);
      } else {
        bank.currentBalance = (bank.currentBalance || 0) - amount;
        console.log(`💸 Payment deducted: -${amount} from ${bank.bankName || bank.name}`);
      }
      await bank.save();
      console.log(`✅ Bank ${bank.bankName || bank.name} new balance: ${bank.currentBalance}`);
    }
  } catch (error) {
    console.error("Error updating bank balance:", error);
  }
};

// Create payment history record
const createPaymentHistory = async (data) => {
  try {
    const payment = await PaymentHistory.create(data);
    return payment;
  } catch (error) {
    console.error("Error creating payment history:", error);
    return null;
  }
};

// Create repair order with attachments support
export const createRepair = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request files:", req.files);
    
    let items = [];
    let attachments = [];
    
    // Parse items if present
    if (req.body.items) {
      items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
    }
    
    // Process items with images
    const processedItems = await Promise.all(items.map(async (item, index) => {
      let imageUrl = "";
      
      if (req.files && req.files.length > 0) {
        const imageFile = req.files.find(file => 
          file.fieldname === `items[${index}].itemImage` || 
          file.fieldname === `itemImage_${index}`
        );
        
        if (imageFile) {
          imageUrl = saveImage(imageFile);
        }
      }
      
      if (!imageUrl && req.file) {
        imageUrl = saveImage(req.file);
      }
      
      return {
        itemName: item.itemName || "",
        itemType: item.itemType || "Other",
        itemDescription: item.itemDescription || "",
        itemWeight: Number(item.itemWeight) || 0,
        itemImage: imageUrl || "",
        serviceType: item.serviceType || "Repair",
        serviceCost: Number(item.serviceCost) || 0,
        status: item.status || "Pending"
      };
    }));
    
    // Process general attachments (photos, documents, videos)
    if (req.files && req.files.length > 0) {
      // Filter out item images and process as general attachments
      const generalAttachments = req.files.filter(file => 
        !file.fieldname.includes('items[') && 
        !file.fieldname.includes('itemImage')
      );
      
      attachments = generalAttachments.map(file => saveAttachment(file, req.body.createdBy || 'System'));
      attachments = attachments.filter(att => att !== null);
    }
    
    const subtotal = processedItems.reduce((sum, item) => sum + (item.serviceCost || 0), 0);
    const finalPayment = Number(req.body.finalPayment) || 0;
    const paidAmount = Number(req.body.paidAmount) || 0;
    const remainingAmount = finalPayment - paidAmount;
    
    const repair = await Repair.create({
      orderNumber: req.body.orderNumber,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      customerEmail: req.body.customerEmail || "",
      customerAddress: req.body.customerAddress || "",
      items: processedItems,
      attachments: attachments,
      subtotal,
      finalPayment,
      paidAmount,
      remainingAmount,
      orderStatus: req.body.orderStatus || 'Pending',
      estimatedDays: Number(req.body.estimatedDays) || 3,
      repairDate: new Date(),
      expectedDeliveryDate: req.body.expectedDeliveryDate || new Date(Date.now() + (Number(req.body.estimatedDays) || 3) * 24 * 60 * 60 * 1000),
      notes: req.body.notes || "",
      createdBy: req.body.createdBy || ""
    });
    
    // Create payment history entry if payment made
    if (paidAmount > 0) {
      await createPaymentHistory({
        transactionType: 'Repair',
        referenceId: repair._id,
        referenceModel: 'Repair',
        amount: paidAmount,
        paymentMethod: req.body.paymentMethod || 'Cash',
        bankId: req.body.bankId || null,
        chequeNumber: req.body.chequeNumber || "",
        paymentDirection: 'Received',
        notes: `Advance payment for repair order ${repair.orderNumber}`,
        receivedBy: req.body.createdBy || "",
        status: 'Completed'
      });
      
      if (req.body.bankId) {
        await updateBankBalance(req.body.bankId, paidAmount, 'increase');
      }
    }
    
    // Get payment history for this repair
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle name accountNumber');
    
    const populatedRepair = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.status(201).json({
      success: true,
      message: "Repair order created successfully",
      data: populatedRepair
    });
  } catch (error) {
    console.error("Create repair error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Add attachment to existing repair
export const addAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, uploadedBy } = req.body;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const attachment = saveAttachment(req.file, uploadedBy || 'System');
    if (attachment) {
      attachment.description = description || '';
      repair.attachments.push(attachment);
      await repair.save();
    }
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Attachment added successfully",
      data: repairWithHistory
    });
  } catch (error) {
    console.error("Add attachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete attachment
export const deleteAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    const attachment = repair.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '..', attachment.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remove attachment from database
    attachment.deleteOne();
    await repair.save();
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Attachment deleted successfully",
      data: repairWithHistory
    });
  } catch (error) {
    console.error("Delete attachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all attachments for a repair
export const getAttachments = async (req, res) => {
  try {
    const { id } = req.params;
    
    const repair = await Repair.findById(id).select('attachments');
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    res.json({
      success: true,
      data: repair.attachments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Make payment
export const makePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, bankId, paymentMethod, transactionId, notes, chequeNumber } = req.body;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    const paymentAmount = Number(amount);
    const newPaidAmount = repair.paidAmount + paymentAmount;
    const remainingAmount = repair.finalPayment - newPaidAmount;
    
    repair.paidAmount = newPaidAmount;
    repair.remainingAmount = remainingAmount;
    await repair.save();
    
    // Create payment history entry
    await createPaymentHistory({
      transactionType: 'Repair',
      referenceId: repair._id,
      referenceModel: 'Repair',
      amount: paymentAmount,
      paymentMethod: paymentMethod || 'Cash',
      bankId: bankId || null,
      chequeNumber: chequeNumber || "",
      transactionId: transactionId || "",
      paymentDirection: 'Received',
      notes: notes || `Payment for repair order ${repair.orderNumber}`,
      receivedBy: req.body.receivedBy || "",
      status: 'Completed'
    });
    
    if (bankId && paymentAmount > 0) {
      await updateBankBalance(bankId, paymentAmount, 'increase');
    }
    
    // Get updated payment history
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const updatedRepair = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Payment recorded successfully",
      data: updatedRepair
    });
  } catch (error) {
    console.error("Payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all repairs with payment history
export const getAllRepairs = async (req, res) => {
  try {
    const repairs = await Repair.find().sort({ createdAt: -1 });
    
    // Get payment history for all repairs
    const repairsWithHistory = await Promise.all(repairs.map(async (repair) => {
      const paymentHistory = await PaymentHistory.find({ 
        referenceId: repair._id, 
        referenceModel: 'Repair' 
      }).populate('bankId', 'bankName accountTitle');
      
      return {
        ...repair.toObject(),
        paymentHistory
      };
    }));
    
    res.json({ success: true, data: repairsWithHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single repair with payment history
export const getRepairById = async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({ success: true, data: repairWithHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get payment history by type
export const getPaymentHistory = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    let filter = {};
    
    if (type && type !== 'all') {
      filter.transactionType = type;
    }
    
    if (startDate && endDate) {
      filter.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const payments = await PaymentHistory.find(filter)
      .populate('bankId', 'bankName accountTitle name accountNumber')
      .sort({ paymentDate: -1 });
    
    // Calculate totals
    const totalReceived = payments
      .filter(p => p.paymentDirection === 'Received')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const totalPaid = payments
      .filter(p => p.paymentDirection === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
      success: true,
      data: {
        payments,
        summary: {
          totalReceived,
          totalPaid,
          netBalance: totalReceived - totalPaid
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get dashboard statistics with payment summary
export const getStatistics = async (req, res) => {
  try {
    const totalOrders = await Repair.countDocuments();
    const pendingOrders = await Repair.countDocuments({ orderStatus: 'Pending' });
    const completedOrders = await Repair.countDocuments({ orderStatus: 'Completed' });
    const inProgressOrders = await Repair.countDocuments({ orderStatus: 'In Progress' });
    
    // Get payment statistics from PaymentHistory
    const repairPayments = await PaymentHistory.aggregate([
      { $match: { transactionType: 'Repair', paymentDirection: 'Received' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    
    const pendingAmountAgg = await Repair.aggregate([
      { $match: { remainingAmount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$remainingAmount" } } }
    ]);
    
    // Get today's payments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayPayments = await PaymentHistory.aggregate([
      { 
        $match: { 
          paymentDate: { $gte: today, $lt: tomorrow },
          paymentDirection: 'Received'
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    
    // Get payment method breakdown
    const paymentMethodBreakdown = await PaymentHistory.aggregate([
      { $match: { transactionType: 'Repair', paymentDirection: 'Received' } },
      { $group: { _id: "$paymentMethod", total: { $sum: "$amount" } } }
    ]);
    
    res.json({
      success: true,
      data: {
        orders: {
          totalOrders,
          pendingOrders,
          completedOrders,
          inProgressOrders
        },
        payments: {
          totalRevenue: repairPayments[0]?.total || 0,
          pendingAmount: pendingAmountAgg[0]?.total || 0,
          todayCollection: todayPayments[0]?.total || 0
        },
        paymentMethodBreakdown
      }
    });
  } catch (error) {
    console.error("Statistics error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update repair order
export const updateRepair = async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    let updateData = { ...req.body };
    
    if (req.body.items) {
      let items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
      
      const processedItems = await Promise.all(items.map(async (item, index) => {
        let imageUrl = item.itemImage || "";
        
        if (req.files && req.files.length > 0) {
          const imageFile = req.files.find(file => 
            file.fieldname === `items[${index}].itemImage`
          );
          if (imageFile) {
            imageUrl = saveImage(imageFile);
          }
        }
        
        return {
          itemName: item.itemName,
          itemType: item.itemType,
          itemDescription: item.itemDescription,
          itemWeight: Number(item.itemWeight) || 0,
          itemImage: imageUrl,
          serviceType: item.serviceType,
          serviceCost: Number(item.serviceCost) || 0,
          status: item.status || "Pending"
        };
      }));
      
      updateData.items = processedItems;
      
      const subtotal = processedItems.reduce((sum, item) => sum + (item.serviceCost || 0), 0);
      const finalPayment = Number(updateData.finalPayment) || repair.finalPayment;
      updateData.subtotal = subtotal;
      updateData.finalPayment = finalPayment;
      updateData.remainingAmount = finalPayment - repair.paidAmount;
    }
    
    const updatedRepair = await Repair.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: updatedRepair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...updatedRepair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Repair order updated successfully",
      data: repairWithHistory
    });
  } catch (error) {
    console.error("Update repair error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, actualDeliveryDate } = req.body;
    
    const repair = await Repair.findByIdAndUpdate(
      id,
      { 
        orderStatus,
        actualDeliveryDate: orderStatus === 'Completed' ? new Date() : actualDeliveryDate
      },
      { new: true }
    );
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Order status updated successfully",
      data: repairWithHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update item status
export const updateItemStatus = async (req, res) => {
  try {
    const { id, itemIndex } = req.params;
    const { status } = req.body;
    
    const repair = await Repair.findById(id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    if (repair.items[itemIndex]) {
      repair.items[itemIndex].status = status;
      await repair.save();
    }
    
    const paymentHistory = await PaymentHistory.find({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    }).populate('bankId', 'bankName accountTitle');
    
    const repairWithHistory = {
      ...repair.toObject(),
      paymentHistory
    };
    
    res.json({
      success: true,
      message: "Item status updated successfully",
      data: repairWithHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete repair
export const deleteRepair = async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: "Repair order not found" });
    }
    
    // Delete associated attachments from filesystem
    if (repair.attachments && repair.attachments.length > 0) {
      repair.attachments.forEach(attachment => {
        const filePath = path.join(__dirname, '..', attachment.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    // Delete associated payment history
    await PaymentHistory.deleteMany({ 
      referenceId: repair._id, 
      referenceModel: 'Repair' 
    });
    
    // Delete the repair
    await Repair.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: "Repair order deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};