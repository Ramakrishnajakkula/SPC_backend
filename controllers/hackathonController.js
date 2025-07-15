const Hackathon = require('../models/hackathonModel');
const HackathonRegistration = require('../models/hackathonRegistrationModel');
const mongoose = require('mongoose');

// @desc    Get all hackathons with filtering and pagination
// @route   GET /api/hackathons
// @access  Public
const getHackathons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      theme,
      mode,
      skillLevel,
      location,
      status,
      dateRange,
      tags,
      sortBy = 'startDate',
      sortOrder = 'asc'
    } = req.query;

    const filter = {};

    // Base filter for published hackathons (unless user is admin or organizer)
    if (!req.user || req.user.role !== 'admin') {
      filter.status = 'published';
    } else if (status) {
      filter.status = status;
    }

    // Search functionality
    if (search) {
      filter.$text = { $search: search };
    }

    // Theme filter
    if (theme && theme !== 'all') {
      filter.theme = theme;
    }

    // Mode filter
    if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    // Skill level filter
    if (skillLevel && skillLevel !== 'all') {
      filter.skillLevel = { $in: [skillLevel, 'all'] };
    }

    // Location filter
    if (location) {
      filter.location = new RegExp(location, 'i');
    }

    // Date range filter
    if (dateRange) {
      const now = new Date();
      switch (dateRange) {
        case 'upcoming':
          filter.startDate = { $gt: now };
          break;
        case 'ongoing':
          filter.startDate = { $lte: now };
          filter.endDate = { $gte: now };
          break;
        case 'completed':
          filter.endDate = { $lt: now };
          break;
        case 'registration-open':
          filter.registrationDeadline = { $gt: now };
          filter.startDate = { $gt: now };
          break;
      }
    }

    // Tags filter
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      filter.tags = { $in: tagArray };
    }

    // If user is logged in, show their own hackathons regardless of status
    if (req.user && req.query.myHackathons === 'true') {
      delete filter.status;
      filter.createdBy = req.user._id;
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const hackathons = await Hackathon.find(filter)
      .populate('createdBy', 'username email')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Hackathon.countDocuments(filter);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      hackathons,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalHackathons: total,
        hasNextPage,
        hasPrevPage,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Error fetching hackathons:', error);
    res.status(500).json({ 
      message: 'Error fetching hackathons', 
      error: error.message 
    });
  }
};

// @desc    Get single hackathon by ID
// @route   GET /api/hackathons/:id
// @access  Public
const getHackathonById = async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check if user can view this hackathon
    if (hackathon.status !== 'published' && 
        (!req.user || (req.user._id.toString() !== hackathon.createdBy._id.toString() && req.user.role !== 'admin'))) {
      return res.status(403).json({ message: 'Not authorized to view this hackathon' });
    }

    // Get registration stats if user is organizer or admin
    let registrationStats = null;
    if (req.user && (req.user._id.toString() === hackathon.createdBy._id.toString() || req.user.role === 'admin')) {
      registrationStats = await HackathonRegistration.getStats(hackathon._id);
    }

    // Check if current user is registered
    let userRegistration = null;
    if (req.user) {
      userRegistration = await HackathonRegistration.findOne({
        hackathon: hackathon._id,
        user: req.user._id
      });
    }

    res.json({
      ...hackathon.toObject(),
      registrationStats,
      userRegistration: userRegistration ? {
        status: userRegistration.status,
        registrationNumber: userRegistration.registrationNumber,
        teamName: userRegistration.teamName,
        participationType: userRegistration.participationType
      } : null
    });

  } catch (error) {
    console.error('Error fetching hackathon:', error);
    res.status(500).json({ 
      message: 'Error fetching hackathon', 
      error: error.message 
    });
  }
};

// @desc    Create new hackathon
// @route   POST /api/hackathons
// @access  Private
const createHackathon = async (req, res) => {
  try {
    const hackathonData = {
      ...req.body,
      createdBy: req.user._id,
      status: req.body.isPublished ? 'published' : 'draft'
    };

    const hackathon = new Hackathon(hackathonData);
    const savedHackathon = await hackathon.save();

    await savedHackathon.populate('createdBy', 'username email');

    res.status(201).json({
      message: 'Hackathon created successfully',
      hackathon: savedHackathon
    });

  } catch (error) {
    console.error('Error creating hackathon:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }

    res.status(500).json({ 
      message: 'Error creating hackathon', 
      error: error.message 
    });
  }
};

// @desc    Update hackathon
// @route   PUT /api/hackathons/:id
// @access  Private (Organizer or Admin only)
const updateHackathon = async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);

    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check authorization
    if (hackathon.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this hackathon' });
    }

    // Update status based on isPublished field
    if (req.body.hasOwnProperty('isPublished')) {
      req.body.status = req.body.isPublished ? 'published' : 'draft';
    }

    const updatedHackathon = await Hackathon.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'username email');

    res.json({
      message: 'Hackathon updated successfully',
      hackathon: updatedHackathon
    });

  } catch (error) {
    console.error('Error updating hackathon:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }

    res.status(500).json({ 
      message: 'Error updating hackathon', 
      error: error.message 
    });
  }
};

// @desc    Delete hackathon
// @route   DELETE /api/hackathons/:id
// @access  Private (Organizer or Admin only)
const deleteHackathon = async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);

    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check authorization
    if (hackathon.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this hackathon' });
    }

    // Check if hackathon has registrations
    const registrationCount = await HackathonRegistration.countDocuments({ 
      hackathon: hackathon._id,
      status: { $ne: 'cancelled' }
    });

    if (registrationCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete hackathon with active registrations. Please cancel all registrations first.' 
      });
    }

    await Hackathon.findByIdAndDelete(req.params.id);

    res.json({ message: 'Hackathon deleted successfully' });

  } catch (error) {
    console.error('Error deleting hackathon:', error);
    res.status(500).json({ 
      message: 'Error deleting hackathon', 
      error: error.message 
    });
  }
};

// @desc    Save hackathon as draft
// @route   POST /api/hackathons/draft
// @access  Private
const saveDraft = async (req, res) => {
  try {
    const draftData = {
      ...req.body,
      createdBy: req.user._id,
      isDraft: true,
      status: 'draft'
    };

    const draft = new Hackathon(draftData);
    const savedDraft = await draft.save();

    res.status(201).json({
      message: 'Draft saved successfully',
      hackathon: savedDraft
    });

  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ 
      message: 'Error saving draft', 
      error: error.message 
    });
  }
};

// @desc    Publish hackathon from draft
// @route   POST /api/hackathons/:id/publish
// @access  Private (Organizer or Admin only)
const publishHackathon = async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);

    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check authorization
    if (hackathon.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to publish this hackathon' });
    }

    hackathon.status = 'published';
    hackathon.isPublished = true;
    hackathon.isDraft = false;

    const publishedHackathon = await hackathon.save();

    res.json({
      message: 'Hackathon published successfully',
      hackathon: publishedHackathon
    });

  } catch (error) {
    console.error('Error publishing hackathon:', error);
    res.status(500).json({ 
      message: 'Error publishing hackathon', 
      error: error.message 
    });
  }
};

// @desc    Get hackathon statistics
// @route   GET /api/hackathons/:id/stats
// @access  Private (Organizer or Admin only)
const getHackathonStats = async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);

    if (!hackathon) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // Check authorization
    if (hackathon.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view hackathon statistics' });
    }

    const registrationStats = await HackathonRegistration.getStats(hackathon._id);
    
    // Additional statistics
    const registrations = await HackathonRegistration.find({ hackathon: hackathon._id });
    
    const skillStats = {};
    const organizationStats = {};
    
    registrations.forEach(reg => {
      // Count skills
      reg.skillSet.forEach(skill => {
        skillStats[skill] = (skillStats[skill] || 0) + 1;
      });
      
      // Count organizations
      const org = reg.organizationName;
      organizationStats[org] = (organizationStats[org] || 0) + 1;
    });

    res.json({
      registrationStats,
      skillStats,
      organizationStats,
      totalViews: hackathon.views || 0,
      registrationRate: hackathon.maxParticipants > 0 
        ? (registrationStats.confirmed / hackathon.maxParticipants * 100).toFixed(2)
        : 0
    });

  } catch (error) {
    console.error('Error fetching hackathon stats:', error);
    res.status(500).json({ 
      message: 'Error fetching hackathon statistics', 
      error: error.message 
    });
  }
};

// @desc    Get featured hackathons
// @route   GET /api/hackathons/featured
// @access  Public
const getFeaturedHackathons = async (req, res) => {
  try {
    const featuredHackathons = await Hackathon.find({
      status: 'published',
      startDate: { $gt: new Date() },
      registrationDeadline: { $gt: new Date() }
    })
    .populate('createdBy', 'username')
    .sort({ registrationCount: -1, createdAt: -1 })
    .limit(6)
    .lean();

    res.json(featuredHackathons);

  } catch (error) {
    console.error('Error fetching featured hackathons:', error);
    res.status(500).json({ 
      message: 'Error fetching featured hackathons', 
      error: error.message 
    });
  }
};

// @desc    Get user's hackathons
// @route   GET /api/hackathons/user
// @access  Private
const getUserHackathons = async (req, res) => {
  try {
    const userHackathons = await Hackathon.find({
      createdBy: req.user._id
    })
    .populate('createdBy', 'username email')
    .sort({ createdAt: -1 })
    .lean();

    res.json(userHackathons);

  } catch (error) {
    console.error('Error fetching user hackathons:', error);
    res.status(500).json({ 
      message: 'Error fetching user hackathons', 
      error: error.message 
    });
  }
};

module.exports = {
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
};
