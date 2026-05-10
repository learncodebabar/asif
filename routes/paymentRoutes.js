import express from 'express';
import Payment from '../models/Payment.js';
import Repair from '../models/Repair.js';
import Bank from '../models/Bank.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get all payments
router.get('/', async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('repairId')
      .populate('bankId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get payment by ID
router.get('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('repairId')
      .populate('bankId');
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get payments by repair
router.get('/repair/:repairId', async (req, res) => {
  try {
    const payments = await Payment.find({ repairId: req.params.repairId })
      .populate('bankId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new payment
router.post('/',
  [
    body('repairId').notEmpty().withMessage('Repair ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('paymentMethod').isIn(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']).withMessage('Invalid payment method'),
    body('status').optional().isIn(['Pending', 'Completed', 'Failed', 'Refunded'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      // Create payment
      const payment = new Payment(req.body);
      await payment.save();

      // Update repair payment info
      const repair = await Repair.findById(payment.repairId);
      if (repair) {
        repair.totalPaid = (repair.totalPaid || 0) + payment.amount;
        
        // Update payment status
        if (repair.totalPaid >= repair.estimatedCost) {
          repair.paymentStatus = 'Completed';
        } else if (repair.totalPaid > 0) {
          repair.paymentStatus = 'Partial';
        }
        
        // Update remaining amount
        repair.remainingAmount = repair.estimatedCost - repair.totalPaid;
        
        await repair.save();
      }

      // Update bank balance if payment is via bank transfer
      if (payment.paymentMethod === 'Bank Transfer' && payment.bankId && payment.status === 'Completed') {
        const bank = await Bank.findById(payment.bankId);
        if (bank) {
          bank.currentBalance = (bank.currentBalance || 0) + payment.amount;
          await bank.save();
        }
      }

      // Populate the payment with references
      const populatedPayment = await Payment.findById(payment._id)
        .populate('repairId')
        .populate('bankId');

      res.status(201).json({ success: true, data: populatedPayment });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Refund payment
router.post('/:id/refund', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status === 'Refunded') {
      return res.status(400).json({ success: false, message: 'Payment already refunded' });
    }

    payment.status = 'Refunded';
    payment.refundedAt = new Date();
    payment.refundReason = req.body.reason || 'No reason provided';
    await payment.save();

    // Update repair payment info
    const repair = await Repair.findById(payment.repairId);
    if (repair) {
      repair.totalPaid -= payment.amount;
      repair.paymentStatus = repair.totalPaid > 0 ? 'Partial' : 'Pending';
      repair.remainingAmount = (repair.remainingAmount || 0) + payment.amount;
      await repair.save();
    }

    // Update bank balance if needed (reverse the transaction)
    if (payment.paymentMethod === 'Bank Transfer' && payment.bankId) {
      const bank = await Bank.findById(payment.bankId);
      if (bank) {
        bank.currentBalance -= payment.amount;
        await bank.save();
      }
    }

    const populatedPayment = await Payment.findById(payment._id)
      .populate('repairId')
      .populate('bankId');

    res.json({ success: true, data: populatedPayment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;