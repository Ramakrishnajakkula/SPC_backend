// /backend/routes/videoRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Video Schema
const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  youtubeUrl: {
    type: String,
    required: true
  },
  seasonNumber: {
    type: Number,
    required: true
  },
  isShort: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Video = mongoose.model('Video', videoSchema);

// Get all videos
router.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ seasonNumber: 1, createdAt: -1 });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add new video
router.post('/videos', async (req, res) => {
  const video = new Video({
    title: req.body.title,
    youtubeUrl: req.body.youtubeUrl,
    seasonNumber: req.body.seasonNumber,
    isShort: req.body.isShort
  });

  try {
    const newVideo = await video.save();
    res.status(201).json(newVideo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/videos/:id', async (req, res) => {
    try {
      const video = await Video.findByIdAndDelete(req.params.id);
      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }
      res.json({ message: 'Video deleted' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

module.exports = router;