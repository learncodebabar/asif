import express from 'express';
import mongoose from 'mongoose';
import Bank from '../models/Bank.js';
import BankTransaction from '../models/BankTransaction.js';

const router = express.Router();

// Get all banks
router.get('/', async (req, res) => {
  try {
    const banks = await Bank.find().sort({ createdAt: -1 });
    console.log('Returning banks:', banks.length, 'banks found');
    console.log('Bank IDs:', banks.map(b => ({ id: b._id, name: b.bankName })));
    
    res.json({
      success: true,
      data: banks
    });
  } catch (error) {
    console.error('Error in GET /banks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single bank by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
    }
    
    const bank = await Bank.findById(id);
    
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank not found' });
    }
    
    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    console.error('Error in GET /banks/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new bank
router.post('/', async (req, res) => {
  try {
    console.log('Received bank data:', req.body);
    
    const {
      category,
      bankName,
      accountTitle,
      accountNumber,
      branchCode,
      ibanNumber,
      swiftCode,
      openingBalance,
      currentBalance,
      status
    } = req.body;
    
    // Validate required fields
    if (!bankName) {
      return res.status(400).json({ success: false, message: 'Bank name is required' });
    }
    if (!accountTitle) {
      return res.status(400).json({ success: false, message: 'Account title is required' });
    }
    if (!accountNumber) {
      return res.status(400).json({ success: false, message: 'Account number is required' });
    }
    
    // Check if account number already exists
    const existingBank = await Bank.findOne({ accountNumber });
    if (existingBank) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bank with this account number already exists' 
      });
    }
    
    const finalOpeningBalance = parseFloat(openingBalance) || 0;
    const finalCurrentBalance = parseFloat(currentBalance) || finalOpeningBalance;
    
    const bank = new Bank({
      category: category || 'Personal',
      bankName: bankName,
      accountTitle: accountTitle,
      accountNumber: accountNumber,
      branchCode: branchCode || '',
      ibanNumber: ibanNumber || '',
      swiftCode: swiftCode || '',
      openingBalance: finalOpeningBalance,
      currentBalance: finalCurrentBalance,
      status: status || 'Active'
    });
    
    await bank.save();
    console.log('Bank created successfully:', bank._id, bank.bankName);
    
    // If initial balance is greater than 0, create an initial deposit transaction
    if (finalCurrentBalance > 0) {
      const transaction = new BankTransaction({
        bankId: bank._id,
        transactionType: 'deposit',
        amount: finalCurrentBalance,
        previousBalance: 0,
        newBalance: finalCurrentBalance,
        description: 'Initial bank account setup',
        referenceType: 'other',
        paymentMethod: 'Initial Deposit',
        status: 'completed',
        transactionDate: new Date()
      });
      
      await transaction.save();
      console.log('Initial transaction created for bank:', bank._id);
    }
    
    res.status(201).json({
      success: true,
      data: bank,
      message: 'Bank created successfully'
    });
  } catch (error) {
    console.error('Error in POST /banks:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update bank
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
    }
    
    const {
      category,
      bankName,
      accountTitle,
      accountNumber,
      branchCode,
      ibanNumber,
      swiftCode,
      openingBalance,
      currentBalance,
      status
    } = req.body;
    
    // Check if account number exists for another bank
    if (accountNumber) {
      const existingBank = await Bank.findOne({ 
        accountNumber, 
        _id: { $ne: id } 
      });
      
      if (existingBank) {
        return res.status(400).json({ 
          success: false, 
          message: 'Bank with this account number already exists' 
        });
      }
    }
    
    const bank = await Bank.findByIdAndUpdate(
      id,
      {
        category: category || 'Personal',
        bankName: bankName,
        accountTitle: accountTitle,
        accountNumber: accountNumber,
        branchCode: branchCode || '',
        ibanNumber: ibanNumber || '',
        swiftCode: swiftCode || '',
        openingBalance: parseFloat(openingBalance) || 0,
        currentBalance: parseFloat(currentBalance) || 0,
        status: status || 'Active'
      },
      { new: true, runValidators: true }
    );
    
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank not found' });
    }
    
    res.json({
      success: true,
      data: bank,
      message: 'Bank updated successfully'
    });
  } catch (error) {
    console.error('Error in PUT /banks/:id:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete bank
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
    }
    
    // Check if bank has transactions
    const transactionCount = await BankTransaction.countDocuments({ bankId: id });
    
    if (transactionCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete bank with existing transactions' 
      });
    }
    
    const bank = await Bank.findByIdAndDelete(id);
    
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank not found' });
    }
    
    res.json({
      success: true,
      message: 'Bank deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /banks/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update bank balance
router.patch('/:id/balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bank ID format' });
    }
    
    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid amount is required' 
      });
    }
    
    if (!type || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type must be either credit or debit' 
      });
    }
    
    const bank = await Bank.findById(id);
    
    if (!bank) {
      return res.status(404).json({ success: false, message: 'Bank not found' });
    }
    
    const previousBalance = bank.currentBalance;
    let newBalance = previousBalance;
    
    if (type === 'credit') {
      newBalance = previousBalance + amount;
    } else {
      if (previousBalance < amount) {
        return res.status(400).json({ 
          success: false, 
          message: 'Insufficient balance' 
        });
      }
      newBalance = previousBalance - amount;
    }
    
    // Create transaction record
    const transaction = new BankTransaction({
      bankId: id,
      transactionType: type === 'credit' ? 'deposit' : 'withdrawal',
      amount: amount,
      previousBalance: previousBalance,
      newBalance: newBalance,
      description: type === 'credit' ? 'Balance credited' : 'Balance debited',
      referenceType: 'other',
      paymentMethod: 'Adjustment',
      status: 'completed',
      transactionDate: new Date()
    });
    
    bank.currentBalance = newBalance;
    
    await Promise.all([
      bank.save(),
      transaction.save()
    ]);
    
    res.json({
      success: true,
      data: {
        bank,
        transaction
      },
      message: `Bank balance ${type === 'credit' ? 'increased' : 'decreased'} successfully`
    });
  } catch (error) {
    console.error('Error in PATCH /banks/:id/balance:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get bank statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalBanks = await Bank.countDocuments();
    const activeBanks = await Bank.countDocuments({ status: 'Active' });
    
    const totalBalance = await Bank.aggregate([
      { $group: { _id: null, total: { $sum: '$currentBalance' } } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalBanks,
        activeBanks,
        totalBalance: totalBalance[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error in GET /banks/stats/summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;