// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.get('/test', (req, res) => {
    try {
      res.status(200).json({ 
        message: 'Auth endpoint is working!',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        message: 'Auth endpoint error',
        error: error.message 
      });
    }
  });
router.post('/signup', authController.signup);
router.post('/login', authController.login);

module.exports = router;