import express from 'express';
import Referral from '../models/Referral.js';
import Repair from '../models/Repair.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get all referrals
router.get('/', async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate('repairId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: referrals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get referral by ID
router.get('/:id', async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id)
      .populate('repairId');
    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral not found' });
    }
    res.json({ success: true, data: referral });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new referral
router.post('/',
  [
    body('repairId').notEmpty().withMessage('Repair ID is required'),
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
      const referral = new Referral(req.body);
      await referral.save();

      // Update repair with referral info
      await Repair.findByIdAndUpdate(req.body.repairId, {
        isReferred: true,
        referredTo: req.body.referredTo,
        referralDate: referral.referralDate,
        referralCost: referral.estimatedCost,
        referralFee: referral.commission,
        referralStatus: referral.status,
        referralNotes: req.body.notes || '',
        status: 'Referred'
      });

      const populatedReferral = await Referral.findById(referral._id)
        .populate('repairId');

      res.status(201).json({ success: true, data: populatedReferral });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Update referral
router.put('/:id',
  [
    body('status').optional().isIn(['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled']),
    body('commissionType').optional().isIn(['Percentage', 'Fixed'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const referral = await Referral.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      
      if (!referral) {
        return res.status(404).json({ success: false, message: 'Referral not found' });
      }
      
      // Update repair referral info
      const updateData = {
        'referralCost': req.body.finalCost || referral.finalCost,
        'referralStatus': req.body.status || referral.status,
        'referralFee': req.body.commission || referral.commission
      };
      
      if (req.body.status === 'Completed') {
        updateData.status = 'Completed';
      }
      
      await Repair.findByIdAndUpdate(referral.repairId, updateData);
      
      const populatedReferral = await Referral.findById(referral._id)
        .populate('repairId');
      
      res.json({ success: true, data: populatedReferral });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Delete referral
router.delete('/:id', async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id);
    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral not found' });
    }

    // Remove referral info from repair
    await Repair.findByIdAndUpdate(referral.repairId, {
      isReferred: false,
      referredTo: null,
      referralDate: null,
      referralCost: null,
      referralFee: null,
      referralStatus: null,
      referralNotes: null,
      status: 'Pending'
    });

    await Referral.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Referral deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get referral statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalReferrals = await Referral.countDocuments();
    const completedReferrals = await Referral.countDocuments({ status: 'Completed' });
    const pendingReferrals = await Referral.countDocuments({ status: 'Pending' });
    const acceptedReferrals = await Referral.countDocuments({ status: 'Accepted' });
    const inProgressReferrals = await Referral.countDocuments({ status: 'In Progress' });
    const cancelledReferrals = await Referral.countDocuments({ status: 'Cancelled' });
    
    const totalCommission = await Referral.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$commission' } } }
    ]);

    const commissionByShop = await Referral.aggregate([
      { $match: { status: 'Completed' } },
      { 
        $group: { 
          _id: '$referredTo.shopName', 
          totalCommission: { $sum: '$commission' },
          count: { $sum: 1 }
        } 
      },
      { $sort: { totalCommission: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        acceptedReferrals,
        inProgressReferrals,
        cancelledReferrals,
        totalCommission: totalCommission[0]?.total || 0,
        commissionByShop
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get referrals by shop
router.get('/shop/:shopName', async (req, res) => {
  try {
    const referrals = await Referral.find({ 'referredTo.shopName': req.params.shopName })
      .populate('repairId')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: referrals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update referral status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const referral = await Referral.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        ...(status === 'Completed' && { actualCompletionDate: new Date() })
      },
      { new: true }
    );
    
    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral not found' });
    }

    // Update repair status
    await Repair.findByIdAndUpdate(referral.repairId, {
      referralStatus: status,
      ...(status === 'Completed' && { status: 'Completed' })
    });

    res.json({ success: true, data: referral });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;