// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const authController = {
  signup: async (req, res) => {
    try {
      const { username, email, password } = req.body;
      const user = new User({ username, email, password });
      await user.save();
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(201).json({ token, userId: user._id });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });
      if (!user) return res.status(401).json({ message: 'Invalid credentials' });
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });
      
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, userId: user._id });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
};

module.exports = authController;