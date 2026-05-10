import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, status, search, lowStock } = req.query;
    
    let query = {};
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$quantity', '$minStockLevel'] };
    }
    
    const products = await Product.find(query).sort({ createdAt: -1 });
    
    console.log(`Found ${products.length} products`);
    
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Error in GET /products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    }
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error in GET /products/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    console.log('Received product data:', req.body);
    
    const {
      name,
      sku,
      barcode,
      category,
      brand,
      model,
      description,
      unit,
      purchasePrice,
      sellingPrice,
      mrp,
      quantity,
      minStockLevel,
      maxStockLevel,
      location,
      supplier,
      warrantyPeriod,
      status
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }
    
    // Check if SKU already exists (if provided)
    if (sku) {
      const existingProduct = await Product.findOne({ sku });
      if (existingProduct) {
        return res.status(400).json({ 
          success: false, 
          message: 'Product with this SKU already exists' 
        });
      }
    }
    
    const product = new Product({
      name,
      sku: sku || '',
      barcode: barcode || '',
      category: category || 'Electronics',
      brand: brand || '',
      model: model || '',
      description: description || '',
      unit: unit || 'Piece',
      purchasePrice: parseFloat(purchasePrice) || 0,
      sellingPrice: parseFloat(sellingPrice) || 0,
      mrp: parseFloat(mrp) || 0,
      quantity: parseInt(quantity) || 0,
      minStockLevel: parseInt(minStockLevel) || 5,
      maxStockLevel: parseInt(maxStockLevel) || 100,
      location: location || '',
      supplier: supplier || '',
      warrantyPeriod: parseInt(warrantyPeriod) || 0,
      status: status || 'Active'
    });
    
    await product.save();
    console.log('Product created successfully:', product._id);
    
    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Error in POST /products:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    }
    
    const {
      name,
      sku,
      barcode,
      category,
      brand,
      model,
      description,
      unit,
      purchasePrice,
      sellingPrice,
      mrp,
      quantity,
      minStockLevel,
      maxStockLevel,
      location,
      supplier,
      warrantyPeriod,
      status
    } = req.body;
    
    // Check if SKU exists for another product
    if (sku) {
      const existingProduct = await Product.findOne({ 
        sku, 
        _id: { $ne: id } 
      });
      
      if (existingProduct) {
        return res.status(400).json({ 
          success: false, 
          message: 'Product with this SKU already exists' 
        });
      }
    }
    
    const product = await Product.findByIdAndUpdate(
      id,
      {
        name,
        sku: sku || '',
        barcode: barcode || '',
        category: category || 'Electronics',
        brand: brand || '',
        model: model || '',
        description: description || '',
        unit: unit || 'Piece',
        purchasePrice: parseFloat(purchasePrice) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        mrp: parseFloat(mrp) || 0,
        quantity: parseInt(quantity) || 0,
        minStockLevel: parseInt(minStockLevel) || 5,
        maxStockLevel: parseInt(maxStockLevel) || 100,
        location: location || '',
        supplier: supplier || '',
        warrantyPeriod: parseInt(warrantyPeriod) || 0,
        status: status || 'Active'
      },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error in PUT /products/:id:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    }
    
    const product = await Product.findByIdAndDelete(id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /products/:id:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update product stock
router.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, type } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID format' });
    }
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    let newQuantity = product.quantity;
    
    if (type === 'add') {
      newQuantity += quantity;
    } else if (type === 'remove') {
      if (product.quantity < quantity) {
        return res.status(400).json({ 
          success: false, 
          message: 'Insufficient stock' 
        });
      }
      newQuantity -= quantity;
    } else {
      newQuantity = quantity;
    }
    
    product.quantity = newQuantity;
    await product.save();
    
    res.json({
      success: true,
      data: product,
      message: 'Stock updated successfully'
    });
  } catch (error) {
    console.error('Error in PATCH /products/:id/stock:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get low stock products
router.get('/reports/low-stock', async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ['$quantity', '$minStockLevel'] },
      status: 'Active'
    }).sort({ quantity: 1 });
    
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Error in GET /products/reports/low-stock:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;