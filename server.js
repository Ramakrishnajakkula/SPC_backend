// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Test endpoint
router.get('/test', (req, res) => {
  
    res.status(500).json({ 
      message: 'Auth endpoint error',
      error: error.message 
    });
});

router.post('/signup', authController.signup);
router.post('/login', authController.login);

module.exports = router;