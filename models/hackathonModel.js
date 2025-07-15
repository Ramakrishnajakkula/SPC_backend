const mongoose = require('mongoose');

const judgingCriteriaSchema = new mongoose.Schema({
  criterion: {
    type: String,
    required: true
  },
  weight: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  }
});

const prizeSchema = new mongoose.Schema({
  position: {
    type: String,
    required: true
  },
  amount: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
});

const socialMediaSchema = new mongoose.Schema({
  twitter: String,
  linkedin: String,
  instagram: String,
  discord: String
});

const hackathonSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true
  },
  shortDescription: {
    type: String,
    required: true,
    maxlength: 150
  },
  detailedDescription: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Dates and Location
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  registrationDeadline: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    default: ''
  },
  venue: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    enum: ['online', 'offline', 'hybrid'],
    default: 'hybrid'
  },
  
  // Participation Details
  teamSizeMin: {
    type: Number,
    default: 1,
    min: 1
  },
  teamSizeMax: {
    type: Number,
    default: 4,
    min: 1
  },
  maxParticipants: {
    type: Number,
    default: 100,
    min: 1
  },
  eligibility: {
    type: String,
    default: ''
  },
  skillLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'all'],
    default: 'all'
  },
  
  // Prizes and Rewards
  totalPrizePool: {
    type: String,
    default: ''
  },
  prizes: [prizeSchema],
  
  // Judging Criteria
  judgingCriteria: [judgingCriteriaSchema],
  
  // Resources and Rules
  resources: {
    type: String,
    default: ''
  },
  rules: {
    type: String,
    default: ''
  },
  schedule: {
    type: String,
    default: ''
  },
  
  // Contact and Organization
  organizerName: {
    type: String,
    required: true
  },
  organizerEmail: {
    type: String,
    required: true
  },
  organizerPhone: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  socialMedia: socialMediaSchema,
  
  // Additional Settings
  isPublished: {
    type: Boolean,
    default: false
  },
  isDraft: {
    type: Boolean,
    default: false
  },
  allowTeamFormation: {
    type: Boolean,
    default: true
  },
  requireResume: {
    type: Boolean,
    default: false
  },
  enableMentorship: {
    type: Boolean,
    default: true
  },
  enableWorkshops: {
    type: Boolean,
    default: false
  },
  
  // Special Features
  specialFeatures: [{
    type: String
  }],
  sponsors: [{
    name: String,
    logo: String,
    website: String,
    tier: {
      type: String,
      enum: ['title', 'gold', 'silver', 'bronze', 'partner']
    }
  }],
  mentors: [{
    name: String,
    photo: String,
    bio: String,
    company: String,
    expertise: [String],
    linkedin: String
  }],
  workshops: [{
    title: String,
    description: String,
    instructor: String,
    datetime: Date,
    duration: Number,
    maxParticipants: Number
  }],
  
  // System fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'ongoing', 'completed', 'cancelled'],
    default: 'draft'
  },
  
  // Statistics
  registrationCount: {
    type: Number,
    default: 0
  },
  teamCount: {
    type: Number,
    default: 0
  },
  projectSubmissions: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
hackathonSchema.index({ title: 'text', shortDescription: 'text', theme: 'text' });
hackathonSchema.index({ startDate: 1 });
hackathonSchema.index({ registrationDeadline: 1 });
hackathonSchema.index({ status: 1 });
hackathonSchema.index({ createdBy: 1 });
hackathonSchema.index({ tags: 1 });

// Virtual for registration status
hackathonSchema.virtual('registrationStatus').get(function() {
  const now = new Date();
  if (now > this.registrationDeadline) {
    return 'closed';
  }
  if (this.registrationCount >= this.maxParticipants) {
    return 'full';
  }
  return 'open';
});

// Virtual for hackathon status based on dates
hackathonSchema.virtual('currentStatus').get(function() {
  const now = new Date();
  if (now < this.startDate) {
    return 'upcoming';
  }
  if (now >= this.startDate && now <= this.endDate) {
    return 'ongoing';
  }
  return 'completed';
});

// Virtual for duration in days
hackathonSchema.virtual('durationDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to validate dates
hackathonSchema.pre('save', function(next) {
  if (this.startDate >= this.endDate) {
    return next(new Error('End date must be after start date'));
  }
  
  if (this.registrationDeadline >= this.startDate) {
    return next(new Error('Registration deadline must be before start date'));
  }
  
  if (this.teamSizeMin > this.teamSizeMax) {
    return next(new Error('Minimum team size cannot be greater than maximum team size'));
  }
  
  // Validate judging criteria weights sum to 100
  if (this.judgingCriteria && this.judgingCriteria.length > 0) {
    const totalWeight = this.judgingCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    if (totalWeight !== 100) {
      return next(new Error('Judging criteria weights must sum to 100'));
    }
  }
  
  next();
});

// Instance method to check if user can register
hackathonSchema.methods.canRegister = function() {
  const now = new Date();
  return now <= this.registrationDeadline && 
         this.registrationCount < this.maxParticipants &&
         this.status === 'published';
};

// Instance method to update registration count
hackathonSchema.methods.updateRegistrationCount = async function() {
  const Registration = mongoose.model('HackathonRegistration');
  this.registrationCount = await Registration.countDocuments({ 
    hackathon: this._id,
    status: { $ne: 'cancelled' }
  });
  return this.save();
};

// Static method to find hackathons by filter
hackathonSchema.statics.findByFilter = function(filter = {}) {
  const query = { status: 'published' };
  
  if (filter.theme) {
    query.theme = filter.theme;
  }
  
  if (filter.mode) {
    query.mode = filter.mode;
  }
  
  if (filter.skillLevel && filter.skillLevel !== 'all') {
    query.skillLevel = { $in: [filter.skillLevel, 'all'] };
  }
  
  if (filter.tags && filter.tags.length > 0) {
    query.tags = { $in: filter.tags };
  }
  
  if (filter.location) {
    query.location = new RegExp(filter.location, 'i');
  }
  
  if (filter.dateRange) {
    if (filter.dateRange === 'upcoming') {
      query.startDate = { $gt: new Date() };
    } else if (filter.dateRange === 'ongoing') {
      query.startDate = { $lte: new Date() };
      query.endDate = { $gte: new Date() };
    }
  }
  
  return this.find(query);
};

module.exports = mongoose.model('Hackathon', hackathonSchema);
