const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://debtmanage.space" }));

// Connect MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  portfolio: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

app.get("/", (req, res) => {
  res.send("DebtManage Backend is running 🚀");
});

// Auth routes
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret");
    res.json({ success: true, token, user: { name: user.name, email: user.email } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get("/api/user-profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const user = await User.findById(decoded.userId).select("-password");
    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));