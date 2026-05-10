import Transaction from "../models/Transaction.js";
import Bank from "../models/Bank.js";

export const withdrawFromBank = async (req, res) => {
  try {
    const { bankId, amount, description } = req.body;

    const bank = await Bank.findById(bankId);
    if (!bank) return res.status(404).json({ message: "Bank not found" });

    if (bank.currentBalance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    bank.currentBalance -= amount;
    await bank.save();

    const transaction = await Transaction.create({
      type: "debit",
      bankId,
      amount,
      description: description || "Withdraw",
    });

    res.status(201).json({ message: "Withdraw success", transaction, bank });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBankTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ bankId: req.params.bankId })
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};