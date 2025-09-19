const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, required: true, unique: true },
  fundName: { type: String, required: true },
  orderType: { type: String, required: true }, // BUY or SELL
  amount: { type: Number, required: true },
  units: { type: Number },
  nav: { type: Number },
  status: { type: String, default: 'PENDING' }, // PENDING, COMPLETED, FAILED
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// Portfolio Schema
const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fundName: { type: String, required: true },
  totalUnits: { type: Number, default: 0 },
  totalInvested: { type: Number, default: 0 },
  currentValue: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

const Portfolio = mongoose.model('Portfolio', portfolioSchema);

// Buy Mutual Fund
async function buyMutualFund(req, res) {
  try {
    const { fundName, amount } = req.body;
    const userId = req.user.userId;
    
    const orderId = `ORD${Date.now()}`;
    const nav = 45.67; // Mock NAV
    const units = amount / nav;
    
    const order = new Order({
      userId,
      orderId,
      fundName,
      orderType: 'BUY',
      amount,
      units,
      nav,
      status: 'COMPLETED'
    });
    
    await order.save();
    
    // Update portfolio
    let portfolio = await Portfolio.findOne({ userId, fundName });
    if (portfolio) {
      portfolio.totalUnits += units;
      portfolio.totalInvested += amount;
      portfolio.currentValue = portfolio.totalUnits * nav;
    } else {
      portfolio = new Portfolio({
        userId,
        fundName,
        totalUnits: units,
        totalInvested: amount,
        currentValue: units * nav
      });
    }
    
    await portfolio.save();
    
    res.json({ success: true, orderId, units, nav });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
}

// Sell Mutual Fund
async function sellMutualFund(req, res) {
  try {
    const { fundName, units } = req.body;
    const userId = req.user.userId;
    
    const portfolio = await Portfolio.findOne({ userId, fundName });
    if (!portfolio || portfolio.totalUnits < units) {
      return res.json({ success: false, message: 'Insufficient units' });
    }
    
    const orderId = `ORD${Date.now()}`;
    const nav = 45.67; // Mock NAV
    const amount = units * nav;
    
    const order = new Order({
      userId,
      orderId,
      fundName,
      orderType: 'SELL',
      amount,
      units,
      nav,
      status: 'COMPLETED'
    });
    
    await order.save();
    
    // Update portfolio
    portfolio.totalUnits -= units;
    portfolio.currentValue = portfolio.totalUnits * nav;
    await portfolio.save();
    
    res.json({ success: true, orderId, amount, nav });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
}

// Get Order Status
async function getOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }
    
    res.json({ success: true, order });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
}

// Get Portfolio
async function getPortfolio(req, res) {
  try {
    const userId = req.user.userId;
    const portfolio = await Portfolio.find({ userId });
    res.json({ success: true, portfolio });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
}

module.exports = {
  buyMutualFund,
  sellMutualFund,
  getOrderStatus,
  getPortfolio
};