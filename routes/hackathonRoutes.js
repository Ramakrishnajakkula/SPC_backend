const express = require('express');
const router = express.Router();
const {
  getHackathons,
  getHackathonById,
  createHackathon,
  updateHackathon,
  deleteHackathon,
  saveDraft,
  publishHackathon,
  getHackathonStats,
  getFeaturedHackathons,
  getUserHackathons
} = require('../controllers/hackathonController');

const {
  registerForHackathon,
  getMyRegistrations,
  getRegistrationById,
  updateRegistration,
  cancelRegistration,
  checkInParticipant,
  submitProject,
  getHackathonRegistrations
} = require('../controllers/hackathonRegistrationController');

const auth = require('../middleware/auth');

// Public routes
router.get('/featured', getFeaturedHackathons);
router.get('/', getHackathons);

// Protected routes - Hackathon management
router.post('/', auth, createHackathon);
router.post('/draft', auth, saveDraft);

// Registration routes (need to be before /:id routes)
router.get('/registrations/my', auth, getMyRegistrations);

// User-specific routes
router.get('/user', auth, getUserHackathons);

// Hackathon specific routes
router.get('/:id', getHackathonById);
router.put('/:id', auth, updateHackathon);
router.delete('/:id', auth, deleteHackathon);
router.post('/:id/publish', auth, publishHackathon);
router.get('/:id/stats', auth, getHackathonStats);

// Registration management routes
router.post('/:id/register', auth, registerForHackathon);
router.get('/:id/registrations', auth, getHackathonRegistrations);

// Registration specific routes
router.get('/registrations/:regId', auth, getRegistrationById);
router.put('/registrations/:regId', auth, updateRegistration);
router.post('/registrations/:regId/cancel', auth, cancelRegistration);
router.post('/registrations/:regId/checkin', auth, checkInParticipant);
router.post('/registrations/:regId/submit', auth, submitProject);

module.exports = router;
