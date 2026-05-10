import express from 'express';
import mongoose from 'mongoose';
import BankTransaction from '../models/BankTransaction.js';
import Bank from '../models/Bank.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get all transactions for a specific bank
router.get('/bank/:bankId', async (req, res) => {
  try {
    const { bankId } = req.params;
    const { startDate, endDate, transactionType, limit = 100, page = 1 } = req.query;
    
    // Validate bankId
    if (!bankId || bankId === 'undefined' || bankId === 'null') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid bank ID provided' 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid bank ID format' 
      });
    }
    
    let query = { bankId: new mongoose.Types.ObjectId(bankId) };
    
    if (startDate && endDate) {
      query.transactionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (transactionType && transactionType !== 'all') {
      query.transactionType = transactionType;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const transactions = await BankTransaction.find(query)
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await BankTransaction.countDocuments(query);
    
    // Get balance summary
    const balanceSummary = await BankTransaction.aggregate([
      { $match: { bankId: new mongoose.Types.ObjectId(bankId) } },
      {
        $group: {
          _id: null,
          totalDeposits: {
            $sum: {
              $cond: [{ $in: ['$transactionType', ['deposit', 'payment_received', 'transfer_in']] }, '$amount', 0]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [{ $in: ['$transactionType', ['withdrawal', 'payment_sent', 'expense', 'transfer_out']] }, '$amount', 0]
            }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        transactions: transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        summary: {
          totalDeposits: balanceSummary[0]?.totalDeposits || 0,
          totalWithdrawals: balanceSummary[0]?.totalWithdrawals || 0,
          netChange: (balanceSummary[0]?.totalDeposits || 0) - (balanceSummary[0]?.totalWithdrawals || 0)
        }
      }
    });
  } catch (error) {
    console.error('Error in GET /bank/:bankId:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new transaction
router.post('/',
  [
    body('bankId').notEmpty().withMessage('Bank ID is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('transactionType').isIn(['deposit', 'withdrawal', 'payment_received', 'payment_sent', 'expense', 'transfer_in', 'transfer_out', 'adjustment']),
    body('description').notEmpty().withMessage('Description is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    try {
      const { bankId, amount, transactionType, description, referenceId, referenceType, paymentMethod, transactionId, notes } = req.body;
      
      // Validate bankId
      if (!mongoose.Types.ObjectId.isValid(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
      }
      
      // Get current bank balance
      const bank = await Bank.findById(bankId);
      if (!bank) {
        return res.status(404).json({ success: false, message: 'Bank not found' });
      }
      
      const previousBalance = bank.currentBalance || 0;
      let newBalance = previousBalance;
      
      // Calculate new balance based on transaction type
      const depositTypes = ['deposit', 'payment_received', 'transfer_in'];
      const withdrawalTypes = ['withdrawal', 'payment_sent', 'expense', 'transfer_out'];
      
      if (depositTypes.includes(transactionType)) {
        newBalance = previousBalance + amount;
        bank.currentBalance = newBalance;
      } else if (withdrawalTypes.includes(transactionType)) {
        if (previousBalance < amount) {
          return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        newBalance = previousBalance - amount;
        bank.currentBalance = newBalance;
      } else if (transactionType === 'adjustment') {
        newBalance = amount;
        bank.currentBalance = newBalance;
      }
      
      // Create transaction record
      const transaction = new BankTransaction({
        bankId: new mongoose.Types.ObjectId(bankId),
        transactionType,
        amount: amount,
        previousBalance,
        newBalance,
        description,
        referenceId: referenceId || '',
        referenceType: referenceType || 'other',
        paymentMethod: paymentMethod || 'Bank Transfer',
        transactionId: transactionId || '',
        notes: notes || '',
        status: 'completed',
        transactionDate: new Date()
      });
      
      await transaction.save();
      await bank.save();
      
      res.status(201).json({
        success: true,
        data: {
          transaction,
          bank: {
            id: bank._id,
            currentBalance: bank.currentBalance,
            accountTitle: bank.accountTitle,
            bankName: bank.bankName
          }
        },
        message: 'Transaction added successfully'
      });
    } catch (error) {
      console.error('Error in POST /bank-transactions:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Get transaction summary for a bank
router.get('/summary/:bankId', async (req, res) => {
  try {
    const { bankId } = req.params;
    const { period = 'month' } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
    }
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'day') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      dateFilter = {
        transactionDate: { $gte: start, $lte: end }
      };
    } else if (period === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      dateFilter = {
        transactionDate: { $gte: weekStart }
      };
    } else if (period === 'month') {
      dateFilter = {
        transactionDate: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        }
      };
    } else if (period === 'year') {
      dateFilter = {
        transactionDate: {
          $gte: new Date(now.getFullYear(), 0, 1),
          $lte: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        }
      };
    }
    
    const transactions = await BankTransaction.aggregate([
      { $match: { bankId: new mongoose.Types.ObjectId(bankId), ...dateFilter } },
      {
        $group: {
          _id: '$transactionType',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const bank = await Bank.findById(bankId);
    
    res.json({
      success: true,
      data: {
        bank: {
          id: bank._id,
          bankName: bank.bankName,
          accountTitle: bank.accountTitle,
          currentBalance: bank.currentBalance
        },
        summary: transactions,
        period
      }
    });
  } catch (error) {
    console.error('Error in GET /summary/:bankId:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction ID format' });
    }
    
    const transaction = await BankTransaction.findById(id).populate('bankId', 'bankName accountTitle');
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error in GET /:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update transaction status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction ID format' });
    }
    
    const transaction = await BankTransaction.findById(id);
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    const oldStatus = transaction.status;
    transaction.status = status;
    await transaction.save();
    
    // If cancelling a transaction, reverse the balance
    if (status === 'cancelled' && oldStatus !== 'cancelled') {
      const bank = await Bank.findById(transaction.bankId);
      const depositTypes = ['deposit', 'payment_received', 'transfer_in'];
      
      if (depositTypes.includes(transaction.transactionType)) {
        bank.currentBalance -= transaction.amount;
      } else {
        bank.currentBalance += transaction.amount;
      }
      
      await bank.save();
    }
    
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error in PATCH /:id/status:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;