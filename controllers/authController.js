// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const authController = {
  signup: async (req, res) => {
    try {
      const { username, email, password } = req.body;
      
      // Check if JWT_SECRET is set
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: 'Server configuration error' });
      }
      
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { username: username },
          { email: email }
        ]
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          message: existingUser.email === email ? 'Email already exists' : 'Username already exists' 
        });
      }
      
      const user = new User({ username, email, password });
      await user.save();
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(201).json({ 
        token, 
        userId: user._id,
        username: user.username,
        email: user.email 
      });
    } catch (error) {
      console.error('Signup error:', error);
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        res.status(400).json({ message: `${field} already exists` });
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  },

  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Check if JWT_SECRET is set
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: 'Server configuration error' });
      }
      
      // Find user by username or email
      const user = await User.findOne({
        $or: [
          { username: username },
          { email: username }
        ]
      });
      
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ 
        token, 
        userId: user._id,
        username: user.username,
        email: user.email 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: error.message });
    }
  }
};

module.exports = authController;