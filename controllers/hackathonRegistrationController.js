const HackathonRegistration = require('../models/hackathonRegistrationModel');
const Hackathon = require('../models/hackathonModel');

// @desc    Register for a hackathon
// @route   POST /api/hackathons/:id/register
// @access  Private
const registerForHackathon = async (req, res) => {
  try {
    const hackathonId = req.params.id;
    const userId = req.user._id;

    // Check if hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check if hackathon accepts registrations
    if (!hackathon.canRegister()) {
      return res.status(400).json({ 
        message: 'Registration is not available for this hackathon' 
      });
    }

    // Check if user is already registered
    const existingRegistration = await HackathonRegistration.findOne({
      hackathon: hackathonId,
      user: userId
    });

    if (existingRegistration) {
      return res.status(400).json({ 
        message: 'You are already registered for this hackathon',
        registration: existingRegistration
      });
    }

    // Create new registration
    const registrationData = {
      ...req.body,
      hackathon: hackathonId,
      user: userId,
      status: 'confirmed' // Auto-confirm for now, can be changed to 'pending' if approval is needed
    };

    const registration = new HackathonRegistration(registrationData);
    const savedRegistration = await registration.save();

    // Populate the registration with hackathon and user data
    await savedRegistration.populate([
      { path: 'hackathon', select: 'title startDate endDate location' },
      { path: 'user', select: 'username email' }
    ]);

    // Update hackathon registration count
    await hackathon.updateRegistrationCount();

    res.status(201).json({
      message: 'Registration successful',
      registration: savedRegistration,
      registrationNumber: savedRegistration.registrationNumber
    });

  } catch (error) {
    console.error('Error registering for hackathon:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }

    res.status(500).json({ 
      message: 'Error registering for hackathon', 
      error: error.message 
    });
  }
};

// @desc    Get user's hackathon registrations
// @route   GET /api/registrations/my
// @access  Private
const getMyRegistrations = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const filters = {};
    if (status) {
      filters.status = status;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const registrations = await HackathonRegistration.findByUser(req.user._id, filters)
      .skip(skip)
      .limit(limitNum);

    const total = await HackathonRegistration.countDocuments({
      user: req.user._id,
      ...filters
    });

    res.json({
      registrations,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRegistrations: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching user registrations:', error);
    res.status(500).json({ 
      message: 'Error fetching registrations', 
      error: error.message 
    });
  }
};

// @desc    Get registration by ID
// @route   GET /api/hackathons/registrations/:regId
// @access  Private
const getRegistrationById = async (req, res) => {
  try {
    const registration = await HackathonRegistration.findById(req.params.regId)
      .populate('hackathon')
      .populate('user', 'username email');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Check authorization - user can view their own registration, or organizer/admin can view registrations for their hackathons
    const isOwner = registration.user._id.toString() === req.user._id.toString();
    const isOrganizer = registration.hackathon.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isOrganizer && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view this registration' });
    }

    res.json(registration);

  } catch (error) {
    console.error('Error fetching registration:', error);
    res.status(500).json({ 
      message: 'Error fetching registration', 
      error: error.message 
    });
  }
};

// @desc    Update registration
// @route   PUT /api/hackathons/registrations/:regId
// @access  Private
const updateRegistration = async (req, res) => {
  try {
    const registration = await HackathonRegistration.findById(req.params.regId);

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Check authorization - only the registered user can update their registration
    if (registration.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this registration' });
    }

    // Check if registration can be updated (not cancelled or if hackathon hasn't started)
    const hackathon = await Hackathon.findById(registration.hackathon);
    const now = new Date();
    
    if (registration.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot update cancelled registration' });
    }
    
    if (now >= hackathon.startDate) {
      return res.status(400).json({ message: 'Cannot update registration after hackathon has started' });
    }

    // Update registration
    const updatedRegistration = await HackathonRegistration.findByIdAndUpdate(
      req.params.regId,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'hackathon', select: 'title startDate endDate location' },
      { path: 'user', select: 'username email' }
    ]);

    res.json({
      message: 'Registration updated successfully',
      registration: updatedRegistration
    });

  } catch (error) {
    console.error('Error updating registration:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }

    res.status(500).json({ 
      message: 'Error updating registration', 
      error: error.message 
    });
  }
};

// @desc    Cancel registration
// @route   POST /api/hackathons/registrations/:regId/cancel
// @access  Private
const cancelRegistration = async (req, res) => {
  try {
    const registration = await HackathonRegistration.findById(req.params.regId);

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Check authorization
    if (registration.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this registration' });
    }

    // Check if registration can be cancelled
    if (registration.status === 'cancelled') {
      return res.status(400).json({ message: 'Registration is already cancelled' });
    }

    const hackathon = await Hackathon.findById(registration.hackathon);
    const now = new Date();
    
    // Allow cancellation up to 24 hours before hackathon starts
    const cancellationDeadline = new Date(hackathon.startDate.getTime() - 24 * 60 * 60 * 1000);
    
    if (now >= cancellationDeadline) {
      return res.status(400).json({ 
        message: 'Cannot cancel registration within 24 hours of hackathon start time' 
      });
    }

    // Cancel the registration
    await registration.cancel();
    
    // Update hackathon registration count
    await hackathon.updateRegistrationCount();

    res.json({
      message: 'Registration cancelled successfully',
      registration
    });

  } catch (error) {
    console.error('Error cancelling registration:', error);
    res.status(500).json({ 
      message: 'Error cancelling registration', 
      error: error.message 
    });
  }
};

// @desc    Check in participant
// @route   POST /api/hackathons/registrations/:regId/checkin
// @access  Private (Organizer or Admin only)
const checkInParticipant = async (req, res) => {
  try {
    const registration = await HackathonRegistration.findById(req.params.regId)
      .populate('hackathon');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Check authorization - only organizer or admin can check in participants
    const isOrganizer = registration.hackathon.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOrganizer && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to check in participants' });
    }

    // Check if already checked in
    if (registration.checkedIn) {
      return res.status(400).json({ message: 'Participant is already checked in' });
    }

    // Check if hackathon has started
    const now = new Date();
    if (now < registration.hackathon.startDate) {
      return res.status(400).json({ message: 'Cannot check in before hackathon starts' });
    }

    // Check in the participant
    await registration.checkIn();

    res.json({
      message: 'Participant checked in successfully',
      registration,
      checkInTime: registration.checkInTime
    });

  } catch (error) {
    console.error('Error checking in participant:', error);
    res.status(500).json({ 
      message: 'Error checking in participant', 
      error: error.message 
    });
  }
};

// @desc    Submit project for hackathon
// @route   POST /api/hackathons/registrations/:regId/submit
// @access  Private
const submitProject = async (req, res) => {
  try {
    const registration = await HackathonRegistration.findById(req.params.regId)
      .populate('hackathon');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    // Check authorization
    if (registration.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to submit project for this registration' });
    }

    // Check if already submitted
    if (registration.projectSubmitted) {
      return res.status(400).json({ message: 'Project already submitted' });
    }

    // Check if hackathon allows submissions (during or after hackathon)
    const now = new Date();
    if (now < registration.hackathon.startDate) {
      return res.status(400).json({ message: 'Cannot submit project before hackathon starts' });
    }

    // Submit the project
    await registration.submitProject(req.body);

    res.json({
      message: 'Project submitted successfully',
      registration,
      submissionTime: registration.projectDetails.submissionTime
    });

  } catch (error) {
    console.error('Error submitting project:', error);
    res.status(500).json({ 
      message: 'Error submitting project', 
      error: error.message 
    });
  }
};

// @desc    Get hackathon registrations (for organizers)
// @route   GET /api/hackathons/:id/registrations
// @access  Private (Organizer or Admin only)
const getHackathonRegistrations = async (req, res) => {
  try {
    const hackathonId = req.params.id;
    
    // Check if hackathon exists and user is authorized
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    const isOrganizer = hackathon.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOrganizer && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to view registrations for this hackathon' });
    }

    const { 
      status, 
      participationType, 
      checkedIn, 
      page = 1, 
      limit = 20,
      search 
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (participationType) filters.participationType = participationType;
    if (checkedIn !== undefined) filters.checkedIn = checkedIn === 'true';

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = HackathonRegistration.findByHackathon(hackathonId, filters);

    // Add search functionality
    if (search) {
      query = query.find({
        $or: [
          { fullName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { organizationName: new RegExp(search, 'i') },
          { teamName: new RegExp(search, 'i') }
        ]
      });
    }

    const registrations = await query
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await HackathonRegistration.countDocuments({
      hackathon: hackathonId,
      ...filters
    });

    res.json({
      registrations,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRegistrations: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching hackathon registrations:', error);
    res.status(500).json({ 
      message: 'Error fetching hackathon registrations', 
      error: error.message 
    });
  }
};

module.exports = {
  registerForHackathon,
  getMyRegistrations,
  getRegistrationById,
  updateRegistration,
  cancelRegistration,
  checkInParticipant,
  submitProject,
  getHackathonRegistrations
};
