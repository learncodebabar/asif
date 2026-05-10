import express from 'express';
import SalesOrder from '../models/SalesOrder.js';
import Product from '../models/Product.js';
import Bank from '../models/Bank.js';
import BankTransaction from '../models/BankTransaction.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get all sales orders
router.get('/', async (req, res) => {
  try {
    const { status, paymentStatus, startDate, endDate, search } = req.query;
    let query = {};
    
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (search) {
      query.$or = [
        { soNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate && endDate) {
      query.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const sales = await SalesOrder.find(query)
      .populate('products.productId', 'name sku sellingPrice')
      .populate('bankId', 'bankName accountTitle')
      .sort({ orderDate: -1 });
    
    res.json({ success: true, data: sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single sales order
router.get('/:id', async (req, res) => {
  try {
    const sale = await SalesOrder.findById(req.params.id)
      .populate('products.productId', 'name sku sellingPrice purchasePrice')
      .populate('bankId', 'bankName accountTitle');
    
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found' });
    }
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create sales order with bank balance update
router.post('/',
  [
    body('customer.name').notEmpty().withMessage('Customer name is required'),
    body('customer.phone').notEmpty().withMessage('Customer phone is required'),
    body('products').isArray().withMessage('Products must be an array'),
    body('totalAmount').isNumeric().withMessage('Total amount must be a number')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      // Generate SO number
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const count = await SalesOrder.countDocuments();
      const sequence = String(count + 1).padStart(5, '0');
      const soNumber = `SO-${year}${month}-${sequence}`;
      
      const remainingAmount = req.body.remainingAmount || (req.body.totalAmount - req.body.amountPaid);
      
      // Update product stock
      for (const item of req.body.products) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(400).json({
            success: false,
            message: `Product not found: ${item.productId}`
          });
        }
        if (product.quantity < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product: ${product.name}. Available: ${product.quantity}`
          });
        }
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { quantity: -item.quantity }
        });
      }
      
      const salesData = {
        ...req.body,
        soNumber: soNumber,
        remainingAmount: remainingAmount,
        orderDate: new Date(),
        status: req.body.status || 'Pending',
        paymentStatus: req.body.amountPaid >= req.body.totalAmount ? 'Paid' : (req.body.amountPaid > 0 ? 'Partial' : 'Pending')
      };
      
      const sale = new SalesOrder(salesData);
      await sale.save();
      
      // ✅ UPDATE BANK BALANCE FOR BANK TRANSFER PAYMENTS
      if (req.body.paymentMethod === 'Bank Transfer' && req.body.bankId && req.body.amountPaid > 0) {
        try {
          const bank = await Bank.findById(req.body.bankId);
          if (bank) {
            const oldBalance = bank.currentBalance || 0;
            // CREDIT - Money coming IN from customer
            bank.currentBalance = oldBalance + req.body.amountPaid;
            await bank.save();
            
            console.log(`💰 Bank ${bank.bankName} balance updated: $${oldBalance} → $${bank.currentBalance} (+$${req.body.amountPaid})`);
            
            // Create bank transaction record
            await BankTransaction.create({
              bankId: req.body.bankId,
              type: 'credit',
              amount: req.body.amountPaid,
              source: 'sales',
              sourceId: sale._id,
              description: `Sales payment from ${req.body.customer.name} - ${soNumber}`,
              transactionId: req.body.transactionId || `SALE-${Date.now()}`,
              date: new Date(),
              status: 'completed'
            });
          }
        } catch (bankError) {
          console.error('Bank balance update error:', bankError);
          // Don't fail the sale if bank update fails
        }
      }
      
      res.status(201).json({ 
        success: true, 
        data: sale,
        message: req.body.paymentMethod === 'Bank Transfer' && req.body.bankId ? 
          `Sale created and bank balance updated!` : 
          `Sale created successfully!`
      });
      
    } catch (error) {
      console.error('Error creating sale:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Update sales order
router.put('/:id', async (req, res) => {
  try {
    const sale = await SalesOrder.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found' });
    }
    
    // Reverse previous stock updates
    for (const item of sale.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.quantity }
      });
    }
    
    const updatedSale = await SalesOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    // Update stock with new quantities
    for (const item of updatedSale.products) {
      const product = await Product.findById(item.productId);
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product: ${product.name}`
        });
      }
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: -item.quantity }
      });
    }
    
    res.json({ success: true, data: updatedSale });
  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update sales order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const sale = await SalesOrder.findById(req.params.id);
    
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found' });
    }
    
    sale.status = status;
    if (status === 'Delivered') {
      sale.deliveryDate = new Date();
    }
    
    await sale.save();
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error('Error updating sale status:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete sales order
router.delete('/:id', async (req, res) => {
  try {
    const sale = await SalesOrder.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sales order not found' });
    }
    
    // Reverse stock updates
    for (const item of sale.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.quantity }
      });
    }
    
    // Reverse bank balance if payment was bank transfer
    if (sale.paymentMethod === 'Bank Transfer' && sale.bankId && sale.amountPaid > 0) {
      try {
        const bank = await Bank.findById(sale.bankId);
        if (bank) {
          bank.currentBalance = (bank.currentBalance || 0) - sale.amountPaid;
          await bank.save();
        }
      } catch (bankError) {
        console.error('Bank balance reversal error:', bankError);
      }
    }
    
    await SalesOrder.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Sales order deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get sales statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalSales = await SalesOrder.countDocuments();
    const completedSales = await SalesOrder.countDocuments({ status: 'Delivered' });
    const pendingSales = await SalesOrder.countDocuments({ status: 'Pending' });
    const processingSales = await SalesOrder.countDocuments({ status: 'Processing' });
    const cancelledSales = await SalesOrder.countDocuments({ status: 'Cancelled' });
    
    const totalRevenue = await SalesOrder.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    const totalReceived = await SalesOrder.aggregate([
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);
    
    const pendingPayments = await SalesOrder.aggregate([
      { $match: { paymentStatus: { $in: ['Pending', 'Partial'] } } },
      { $group: { _id: null, total: { $sum: '$remainingAmount' } } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalSales,
        completedSales,
        pendingSales,
        processingSales,
        cancelledSales,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalReceived: totalReceived[0]?.total || 0,
        pendingPayments: pendingPayments[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;