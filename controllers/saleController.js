import Sale from "../models/Sale.js";
import Bank from "../models/Bank.js";
import Transaction from "../models/Transaction.js";

export const createSale = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      products,
      bankId,
      paidAmount,
    } = req.body;

    const totalAmount = products.reduce((sum, p) => sum + p.total, 0);
    const remainingAmount = totalAmount - (paidAmount || 0);

    let paymentStatus = "Unpaid";
    if (paidAmount > 0 && remainingAmount > 0) paymentStatus = "Partial";
    if (remainingAmount === 0) paymentStatus = "Paid";

    const sale = await Sale.create({
      customerName,
      customerPhone,
      products,
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentStatus,
      bankId,
    });

    // add transaction credit in bank
    if (paidAmount > 0 && bankId) {
      const bank = await Bank.findById(bankId);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      bank.currentBalance += paidAmount;
      await bank.save();

      await Transaction.create({
        type: "credit",
        bankId,
        saleId: sale._id,
        amount: paidAmount,
        description: `Customer Payment - ${customerName}`,
      });
    }

    res.status(201).json({ message: "Sale Created", sale });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSales = async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addSalePayment = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { bankId, amount } = req.body;

    const sale = await Sale.findById(saleId);
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    if (sale.remainingAmount <= 0) {
      return res.status(400).json({ message: "Already fully paid" });
    }

    if (amount > sale.remainingAmount) {
      return res.status(400).json({ message: "Amount greater than remaining" });
    }

    const bank = await Bank.findById(bankId);
    if (!bank) return res.status(404).json({ message: "Bank not found" });

    sale.paidAmount += amount;
    sale.remainingAmount -= amount;

    if (sale.remainingAmount === 0) sale.paymentStatus = "Paid";
    else sale.paymentStatus = "Partial";

    await sale.save();

    bank.currentBalance += amount;
    await bank.save();

    await Transaction.create({
      type: "credit",
      bankId,
      saleId: sale._id,
      amount,
      description: `Remaining Payment - ${sale.customerName}`,
    });

    res.json({ message: "Payment Added", sale, bank });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};