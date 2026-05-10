import Bank from "../models/Bank.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/bank-logos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Helper function to save file locally
const saveFileLocally = (file) => {
  try {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'bank-' + uniqueSuffix + path.extname(file.originalname);
    const filepath = path.join(uploadDir, filename);
    
    // Save file
    fs.writeFileSync(filepath, file.buffer);
    
    // Return URL (adjust port and host as needed)
    const fileUrl = `/uploads/bank-logos/${filename}`;
    return fileUrl;
  } catch (error) {
    throw new Error('Failed to save file');
  }
};

// Helper function to delete old logo
const deleteOldLogo = (logoUrl) => {
  if (logoUrl && !logoUrl.startsWith('http')) {
    const filename = path.basename(logoUrl);
    const filepath = path.join(uploadDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
};

// Create Bank with Logo Upload
export const createBank = async (req, res) => {
  try {
    let logoUrl = "";
    
    // Check if logo file is uploaded
    if (req.file) {
      logoUrl = saveFileLocally(req.file);
    }
    
    const bank = await Bank.create({
      name: req.body.name,
      logo: logoUrl || req.body.logo || "",
      accountTitle: req.body.accountTitle,
      accountNumber: req.body.accountNumber,
      iban: req.body.iban || "",
      branch: req.body.branch || "",
      openingBalance: Number(req.body.openingBalance) || 0,
      currentBalance: Number(req.body.openingBalance) || 0,
    });
    
    res.status(201).json({
      success: true,
      message: "Bank created successfully",
      data: bank
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get All Banks
export const getBanks = async (req, res) => {
  try {
    const banks = await Bank.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: banks
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Get Single Bank
export const getSingleBank = async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) return res.status(404).json({ 
      success: false,
      message: "Bank not found" 
    });
    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Update Bank Logo
export const updateBankLogo = async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: "Bank not found" 
      });
    }
    
    let logoUrl = "";
    if (req.file) {
      // Delete old logo if exists
      if (bank.logo && !bank.logo.startsWith('http')) {
        deleteOldLogo(bank.logo);
      }
      logoUrl = saveFileLocally(req.file);
      bank.logo = logoUrl;
      await bank.save();
    }
    
    res.json({
      success: true,
      message: "Logo updated successfully",
      data: bank
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Update Bank (Full Update)
export const updateBank = async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: "Bank not found" 
      });
    }
    
    let logoUrl = bank.logo;
    if (req.file) {
      // Delete old logo if exists
      if (bank.logo && !bank.logo.startsWith('http')) {
        deleteOldLogo(bank.logo);
      }
      logoUrl = saveFileLocally(req.file);
    }
    
    const updatedBank = await Bank.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name || bank.name,
        logo: logoUrl,
        accountTitle: req.body.accountTitle || bank.accountTitle,
        accountNumber: req.body.accountNumber || bank.accountNumber,
        iban: req.body.iban || bank.iban,
        branch: req.body.branch || bank.branch,
        openingBalance: req.body.openingBalance !== undefined ? Number(req.body.openingBalance) : bank.openingBalance,
        currentBalance: req.body.openingBalance !== undefined ? Number(req.body.openingBalance) : bank.currentBalance,
      },
      { new: true }
    );
    
    res.json({
      success: true,
      message: "Bank updated successfully",
      data: updatedBank
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Delete Bank
export const deleteBank = async (req, res) => {
  try {
    const bank = await Bank.findById(req.params.id);
    if (!bank) {
      return res.status(404).json({ 
        success: false,
        message: "Bank not found" 
      });
    }
    
    // Delete logo file if exists
    if (bank.logo && !bank.logo.startsWith('http')) {
      deleteOldLogo(bank.logo);
    }
    
    await Bank.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: "Bank deleted successfully"
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};