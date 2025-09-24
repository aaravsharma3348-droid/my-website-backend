const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { buyMutualFund, sellMutualFund, getOrderStatus, getPortfolio } = require('./transaction-engine');

const app = express();
app.use(express.json());
app.use(express.static('.'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Use the environment variable for the connection string
const dbURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/debtmanage';

console.log('Using DB URI:', dbURI.substring(0, 20) + '...');

mongoose.connect(dbURI)
  .then(() => console.log('✅ MongoDB connected successfully!'))
  .catch(err => console.log('❌ MongoDB connection failed:', err.message));

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Investment Schema
const investmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fundName: { type: String, required: true },
  investmentType: { type: String, required: true }, // SIP or Lumpsum
  amount: { type: Number, required: true },
  sipDate: { type: Number }, // For SIP investments
  paymentId: { type: String, required: true },
  orderId: { type: String, required: true },
  status: { type: String, default: 'completed' },
  createdAt: { type: Date, default: Date.now }
});

const Investment = mongoose.model('Investment', investmentSchema);

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: 'rzp_test_your_key_id', // Replace with your Razorpay Key ID
  key_secret: 'your_razorpay_secret' // Replace with your Razorpay Secret
});

// Signup endpoint
app.post('/signup', async (req, res) => {
  try {
    console.log('Received signup request:', req.body);
    const { name, email, mobile, password } = req.body;
    console.log('Extracted fields:', { name, email, mobile, password });
    
    if (!name || !email || !mobile || !password) {
      console.log('Validation failed - missing fields');
      return res.json({ success: false, message: 'All fields are required' });
    }
    
    console.log('All fields present, proceeding with registration...');
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      name,
      email,
      mobile,
      password: hashedPassword
    });
    
    await user.save();
    console.log('✅ User registered:', email);
    res.json({ success: true, message: 'Account created successfully' });
    
  } catch (error) {
    console.log('❌ Signup error:', error.message);
    if (error.code === 11000) {
      res.json({ success: false, message: 'Email already exists' });
    } else {
      res.json({ success: false, message: 'Registration failed' });
    }
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ email: username });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user._id }, 'secret_key');
      console.log('✅ Login successful:', username);
      res.json({ success: true, token, message: 'Login successful' });
    } else {
      console.log('❌ Invalid credentials for:', username);
      res.json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
    res.json({ success: false, message: 'Login failed' });
  }
});

// Get user profile
app.get('/user-profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, 'secret_key');
    const user = await User.findById(decoded.userId, 'name email');
    res.json({ success: true, user });
  } catch (error) {
    res.json({ success: false, message: 'Invalid token' });
  }
});

// Test endpoint to view users (remove in production)
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name email mobile createdAt');
    res.json(users);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Create Razorpay Order
app.post('/create-order', async (req, res) => {
  try {
    const { amount, currency, investmentData } = req.body;
    
    const options = {
      amount: amount, // amount in paise
      currency: currency || 'INR',
      receipt: `receipt_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);
    
    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency
    });
    
  } catch (error) {
    console.error('Order creation error:', error);
    res.json({ success: false, message: 'Failed to create order' });
  }
});

// Verify Payment
app.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      investmentData
    } = req.body;
    
    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', 'your_razorpay_secret') // Replace with your secret
      .update(sign.toString())
      .digest('hex');
    
    if (razorpay_signature === expectedSign) {
      // Payment verified, save investment
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = jwt.verify(token, 'secret_key');
      
      const investment = new Investment({
        userId: decoded.userId,
        fundName: investmentData.fund,
        investmentType: investmentData.type,
        amount: investmentData.amount,
        sipDate: investmentData.date,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id
      });
      
      await investment.save();
      
      res.json({ success: true, message: 'Payment verified and investment saved' });
    } else {
      res.json({ success: false, message: 'Invalid signature' });
    }
    
  } catch (error) {
    console.error('Payment verification error:', error);
    res.json({ success: false, message: 'Payment verification failed' });
  }
});

// Fund Request Schema
const fundRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  network: { type: String, required: true }, // bep20 or trc20
  amount: { type: Number, required: true },
  txHash: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, default: 'pending' }, // pending, verified, rejected
  createdAt: { type: Date, default: Date.now }
});

const FundRequest = mongoose.model('FundRequest', fundRequestSchema);

// Add Funds Request
app.post('/add-funds', async (req, res) => {
  try {
    const { network, amount, txHash, address } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, 'secret_key');
    
    const fundRequest = new FundRequest({
      userId: decoded.userId,
      network,
      amount,
      txHash,
      address
    });
    
    await fundRequest.save();
    
    res.json({ success: true, message: 'Fund request submitted successfully' });
    
  } catch (error) {
    console.error('Fund request error:', error);
    res.json({ success: false, message: 'Failed to submit fund request' });
  }
});

// Middleware for authentication
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ success: false, message: 'Access denied' });
  
  try {
    const decoded = jwt.verify(token, 'secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    res.json({ success: false, message: 'Invalid token' });
  }
}

// Transaction Engine APIs
app.post('/buy-fund', authenticateToken, buyMutualFund);
app.post('/sell-fund', authenticateToken, sellMutualFund);
app.get('/order-status/:orderId', authenticateToken, getOrderStatus);
app.get('/portfolio', authenticateToken, getPortfolio);

// Get user investments
app.get('/investments', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, 'secret_key');
    
    const investments = await Investment.find({ userId: decoded.userId }).sort({ createdAt: -1 });
    res.json(investments);
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.listen(3001, () => console.log('🚀 Server running on port 3001 with MongoDB and Razorpay'));