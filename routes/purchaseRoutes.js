import express from 'express';
import mongoose from 'mongoose';
import Purchase from '../models/PurchaseOrder.js';
import Product from '../models/Product.js';
import Bank from '../models/Bank.js';
import BankTransaction from '../models/BankTransaction.js';

const router = express.Router();

// Get all purchases
router.get('/', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    
    let query = {};
    
    if (status && status !== 'All') {
      query.status = status;
    }
    
    if (startDate && endDate) {
      query.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const purchases = await Purchase.find(query)
      .sort({ createdAt: -1 })
      .populate('bankId', 'bankName accountTitle');
    
    console.log(`Found ${purchases.length} purchases`);
    
    res.json({
      success: true,
      data: purchases,
      count: purchases.length
    });
  } catch (error) {
    console.error('Error in GET /purchases:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single purchase by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID format' });
    }
    
    const purchase = await Purchase.findById(id).populate('bankId', 'bankName accountTitle');
    
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    
    res.json({
      success: true,
      data: purchase
    });
  } catch (error) {
    console.error('Error in GET /purchases/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new purchase
router.post('/', async (req, res) => {
  try {
    console.log('Received purchase data:', req.body);
    
    const {
      supplier,
      products,
      subtotal,
      discount,
      discountType,
      tax,
      taxRate,
      shippingCost,
      totalAmount,
      amountPaid,
      paymentMethod,
      bankId,
      transactionId,
      notes
    } = req.body;
    
    // Validate required fields
    if (!supplier || !supplier.name) {
      return res.status(400).json({ success: false, message: 'Supplier name is required' });
    }
    
    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product is required' });
    }
    
    // Get bank name if bank transfer
    let bankName = '';
    if (paymentMethod === 'Bank Transfer' && bankId) {
      const bank = await Bank.findById(bankId);
      if (bank) {
        bankName = `${bank.bankName} - ${bank.accountTitle}`;
      }
    }
    
    // Create purchase
    const purchase = new Purchase({
      supplier,
      products,
      subtotal: subtotal || 0,
      discount: discount || 0,
      discountType: discountType || 'Fixed',
      tax: tax || 0,
      taxRate: taxRate || 0,
      shippingCost: shippingCost || 0,
      totalAmount: totalAmount || 0,
      amountPaid: amountPaid || 0,
      paymentMethod: paymentMethod || 'Cash',
      bankId: bankId || null,
      bankName: bankName,
      transactionId: transactionId || '',
      notes: notes || '',
      status: amountPaid >= totalAmount ? 'Completed' : 'Ordered'
    });
    
    await purchase.save();
    console.log('Purchase created successfully:', purchase._id, purchase.poNumber);
    
    // Update product quantities
    for (const item of products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.quantity }
      });
    }
    
    // If payment is made via bank transfer, create bank transaction
    if (paymentMethod === 'Bank Transfer' && bankId && amountPaid > 0) {
      const bank = await Bank.findById(bankId);
      if (bank) {
        const previousBalance = bank.currentBalance;
        const newBalance = previousBalance - amountPaid; // Decrease bank balance for purchase
        
        const bankTransaction = new BankTransaction({
          bankId: bankId,
          transactionType: 'payment_sent',
          amount: amountPaid,
          previousBalance: previousBalance,
          newBalance: newBalance,
          description: `Purchase order ${purchase.poNumber} - ${supplier.name}`,
          referenceId: purchase._id,
          referenceType: 'purchase',
          paymentMethod: 'Bank Transfer',
          transactionId: transactionId || `PO-${purchase._id}`,
          notes: notes || `Payment for purchase from ${supplier.name}`,
          status: 'completed',
          transactionDate: new Date()
        });
        
        await bankTransaction.save();
        bank.currentBalance = newBalance;
        await bank.save();
        console.log('Bank transaction created for purchase');
      }
    }
    
    res.status(201).json({
      success: true,
      data: purchase,
      message: 'Purchase order created successfully'
    });
  } catch (error) {
    console.error('Error in POST /purchases:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update purchase
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID format' });
    }
    
    const {
      supplier,
      products,
      subtotal,
      discount,
      discountType,
      tax,
      taxRate,
      shippingCost,
      totalAmount,
      amountPaid,
      paymentMethod,
      bankId,
      transactionId,
      status,
      notes
    } = req.body;
    
    // Get bank name if bank transfer
    let bankName = '';
    if (paymentMethod === 'Bank Transfer' && bankId) {
      const bank = await Bank.findById(bankId);
      if (bank) {
        bankName = `${bank.bankName} - ${bank.accountTitle}`;
      }
    }
    
    const purchase = await Purchase.findByIdAndUpdate(
      id,
      {
        supplier,
        products,
        subtotal: subtotal || 0,
        discount: discount || 0,
        discountType: discountType || 'Fixed',
        tax: tax || 0,
        taxRate: taxRate || 0,
        shippingCost: shippingCost || 0,
        totalAmount: totalAmount || 0,
        amountPaid: amountPaid || 0,
        remainingAmount: (totalAmount || 0) - (amountPaid || 0),
        paymentMethod: paymentMethod || 'Cash',
        bankId: bankId || null,
        bankName: bankName,
        transactionId: transactionId || '',
        status: status || (amountPaid >= totalAmount ? 'Completed' : 'Ordered'),
        notes: notes || ''
      },
      { new: true, runValidators: true }
    );
    
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    
    res.json({
      success: true,
      data: purchase,
      message: 'Purchase updated successfully'
    });
  } catch (error) {
    console.error('Error in PUT /purchases/:id:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete purchase
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID format' });
    }
    
    const purchase = await Purchase.findById(id);
    
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    
    // Reverse product quantities
    for (const item of purchase.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: -item.quantity }
      });
    }
    
    await Purchase.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Purchase deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /purchases/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update purchase status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID format' });
    }
    
    const purchase = await Purchase.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    
    res.json({
      success: true,
      data: purchase,
      message: 'Purchase status updated successfully'
    });
  } catch (error) {
    console.error('Error in PATCH /purchases/:id/status:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Receive products (partial or full)
router.post('/:id/receive', async (req, res) => {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid purchase ID format' });
    }
    
    const purchase = await Purchase.findById(id);
    
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }
    
    // Update received quantities
    for (const received of receivedItems) {
      const product = await Product.findById(received.productId);
      if (product) {
        product.quantity += received.quantity;
        await product.save();
      }
    }
    
    // Update purchase status
    let allReceived = true;
    for (const item of purchase.products) {
      const received = receivedItems.find(r => r.productId === item.productId.toString());
      if (!received || received.quantity < item.quantity) {
        allReceived = false;
        break;
      }
    }
    
    purchase.status = allReceived ? 'Completed' : 'Partial Received';
    purchase.receivedDate = new Date();
    await purchase.save();
    
    res.json({
      success: true,
      data: purchase,
      message: 'Products received successfully'
    });
  } catch (error) {
    console.error('Error in POST /purchases/:id/receive:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get purchase summary/reports
router.get('/reports/summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'month') {
      dateFilter = {
        orderDate: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        }
      };
    } else if (period === 'year') {
      dateFilter = {
        orderDate: {
          $gte: new Date(now.getFullYear(), 0, 1),
          $lte: new Date(now.getFullYear(), 11, 31)
        }
      };
    }
    
    const summary = await Purchase.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$amountPaid' },
          averagePurchase: { $avg: '$totalAmount' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        period,
        summary: summary[0] || {
          totalPurchases: 0,
          totalAmount: 0,
          totalPaid: 0,
          averagePurchase: 0
        }
      }
    });
  } catch (error) {
    console.error('Error in GET /purchases/reports/summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;