import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname issue in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Import routes
import bankRoutes from "./routes/bankRoutes.js";
import repairRoutes from "./routes/repairRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import bankTransactionRoutes from "./routes/bankTransactionRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import salesRoutes from "./routes/salesRoutes.js"; // ✅ ADD THIS LINE
// import categoryRoutes from './routes/categoryRoutes.js'; // If you have category routes

// Use routes
app.use("/api/banks", bankRoutes);
app.use("/api/repairs", repairRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/bank-transactions", bankTransactionRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", salesRoutes); // ✅ ADD THIS LINE
// app.use('/api/categories', categoryRoutes); // If you have category routes

// MongoDB connection

mongoose
  .connect(
    "mongodb+srv://admin:admin123@cluster0.jvim2i3.mongodb.net/?appName=Cluster0"
  )
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;

// Home route
app.get("/", (req, res) => {
  const dbStatus =
    mongoose.connection.readyState === 1
      ? "MongoDB Connected ✅"
      : "MongoDB Not Connected ❌";

  res.send(`
    <h1>Server is Running 🚀</h1>
    <p>${dbStatus}</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
