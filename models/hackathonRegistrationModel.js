const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    default: ''
  }
});

const hackathonRegistrationSchema = new mongoose.Schema({
  // Reference to hackathon and user
  hackathon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hackathon',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic Information
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    default: ''
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say', ''],
    default: ''
  },
  
  // Professional/Academic Info
  organizationName: {
    type: String,
    required: true
  },
  currentRole: {
    type: String,
    required: true
  },
  resume: {
    type: String,
    default: ''
  },
  linkedinProfile: {
    type: String,
    default: ''
  },
  
  // Hackathon-Specific Info
  skillSet: [{
    type: String,
    required: true
  }],
  techStack: [{
    type: String
  }],
  portfolio: {
    type: String,
    default: ''
  },
  githubProfile: {
    type: String,
    default: ''
  },
  personalWebsite: {
    type: String,
    default: ''
  },
  tshirtSize: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', ''],
    default: ''
  },
  
  // Team Details
  participationType: {
    type: String,
    enum: ['solo', 'team'],
    required: true,
    default: 'solo'
  },
  teamName: {
    type: String,
    default: ''
  },
  teamMembers: [teamMemberSchema],
  
  // Optional Information
  motivation: {
    type: String,
    default: ''
  },
  previousExperience: {
    type: String,
    default: ''
  },
  projectIdeas: {
    type: String,
    default: ''
  },
  
  // Legal Compliance
  agreeToTerms: {
    type: Boolean,
    required: true,
    default: false
  },
  agreeToPhotos: {
    type: Boolean,
    default: false
  },
  agreeToCodeOfConduct: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // Registration Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'waitlisted', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  // Check-in Information
  checkedIn: {
    type: Boolean,
    default: false
  },
  checkInTime: {
    type: Date
  },
  
  // Project Submission
  projectSubmitted: {
    type: Boolean,
    default: false
  },
  projectDetails: {
    title: String,
    description: String,
    githubRepo: String,
    liveDemo: String,
    presentationLink: String,
    videoDemo: String,
    technologies: [String],
    submissionTime: Date
  },
  
  // Communication
  emailConfirmationSent: {
    type: Boolean,
    default: false
  },
  remindersSent: {
    type: Number,
    default: 0
  },
  
  // Additional Notes
  adminNotes: {
    type: String,
    default: ''
  },
  specialRequirements: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for better performance
hackathonRegistrationSchema.index({ hackathon: 1, user: 1 }, { unique: true });
hackathonRegistrationSchema.index({ hackathon: 1, status: 1 });
hackathonRegistrationSchema.index({ user: 1, status: 1 });
hackathonRegistrationSchema.index({ email: 1 });
hackathonRegistrationSchema.index({ teamName: 1 });

// Text index for search
hackathonRegistrationSchema.index({
  fullName: 'text',
  email: 'text',
  organizationName: 'text',
  teamName: 'text'
});

// Virtual for team size
hackathonRegistrationSchema.virtual('teamSize').get(function() {
  if (this.participationType === 'solo') {
    return 1;
  }
  return this.teamMembers.length + 1; // +1 for the registrant
});

// Virtual for registration number
hackathonRegistrationSchema.virtual('registrationNumber').get(function() {
  const year = this.createdAt.getFullYear();
  const month = String(this.createdAt.getMonth() + 1).padStart(2, '0');
  const id = this._id.toString().slice(-6).toUpperCase();
  return `REG${year}${month}${id}`;
});

// Pre-save middleware for validation
hackathonRegistrationSchema.pre('save', async function(next) {
  // Validate team participation
  if (this.participationType === 'team') {
    if (!this.teamName || this.teamName.trim() === '') {
      return next(new Error('Team name is required for team participation'));
    }
    
    if (this.teamMembers.length === 0) {
      return next(new Error('At least one team member is required for team participation'));
    }
  }
  
  // Check if hackathon still accepts registrations
  if (this.isNew) {
    const Hackathon = mongoose.model('Hackathon');
    const hackathon = await Hackathon.findById(this.hackathon);
    
    if (!hackathon) {
      return next(new Error('Hackathon not found'));
    }
    
    if (!hackathon.canRegister()) {
      return next(new Error('Registration is not available for this hackathon'));
    }
    
    // Check team size constraints
    const teamSize = this.participationType === 'solo' ? 1 : this.teamMembers.length + 1;
    if (teamSize < hackathon.teamSizeMin || teamSize > hackathon.teamSizeMax) {
      return next(new Error(`Team size must be between ${hackathon.teamSizeMin} and ${hackathon.teamSizeMax} members`));
    }
  }
  
  // Validate required fields based on hackathon requirements
  if (!this.agreeToTerms || !this.agreeToCodeOfConduct) {
    return next(new Error('Must agree to terms and conditions and code of conduct'));
  }
  
  next();
});

// Post-save middleware to update hackathon registration count
hackathonRegistrationSchema.post('save', async function(doc) {
  if (doc.status === 'confirmed') {
    const Hackathon = mongoose.model('Hackathon');
    const hackathon = await Hackathon.findById(doc.hackathon);
    if (hackathon) {
      await hackathon.updateRegistrationCount();
    }
  }
});

// Post-remove middleware to update hackathon registration count
hackathonRegistrationSchema.post('remove', async function(doc) {
  const Hackathon = mongoose.model('Hackathon');
  const hackathon = await Hackathon.findById(doc.hackathon);
  if (hackathon) {
    await hackathon.updateRegistrationCount();
  }
});

// Instance method to confirm registration
hackathonRegistrationSchema.methods.confirm = function() {
  this.status = 'confirmed';
  this.emailConfirmationSent = true;
  return this.save();
};

// Instance method to cancel registration
hackathonRegistrationSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Instance method to check in participant
hackathonRegistrationSchema.methods.checkIn = function() {
  this.checkedIn = true;
  this.checkInTime = new Date();
  return this.save();
};

// Instance method to submit project
hackathonRegistrationSchema.methods.submitProject = function(projectData) {
  this.projectSubmitted = true;
  this.projectDetails = {
    ...projectData,
    submissionTime: new Date()
  };
  return this.save();
};

// Static method to find registrations by hackathon
hackathonRegistrationSchema.statics.findByHackathon = function(hackathonId, filters = {}) {
  const query = { hackathon: hackathonId };
  
  if (filters.status) {
    query.status = filters.status;
  }
  
  if (filters.participationType) {
    query.participationType = filters.participationType;
  }
  
  if (filters.checkedIn !== undefined) {
    query.checkedIn = filters.checkedIn;
  }
  
  return this.find(query).populate('user', 'username email').populate('hackathon', 'title');
};

// Static method to find user's registrations
hackathonRegistrationSchema.statics.findByUser = function(userId, filters = {}) {
  const query = { user: userId };
  
  if (filters.status) {
    query.status = filters.status;
  }
  
  return this.find(query)
    .populate('hackathon', 'title shortDescription startDate endDate location mode')
    .sort({ createdAt: -1 });
};

// Static method to get registration statistics
hackathonRegistrationSchema.statics.getStats = async function(hackathonId) {
  const stats = await this.aggregate([
    { $match: { hackathon: mongoose.Types.ObjectId(hackathonId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        checkedIn: { $sum: { $cond: ['$checkedIn', 1, 0] } },
        projectsSubmitted: { $sum: { $cond: ['$projectSubmitted', 1, 0] } },
        soloParticipants: { $sum: { $cond: [{ $eq: ['$participationType', 'solo'] }, 1, 0] } },
        teamParticipants: { $sum: { $cond: [{ $eq: ['$participationType', 'team'] }, 1, 0] } }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    checkedIn: 0,
    projectsSubmitted: 0,
    soloParticipants: 0,
    teamParticipants: 0
  };
};

module.exports = mongoose.model('HackathonRegistration', hackathonRegistrationSchema);
