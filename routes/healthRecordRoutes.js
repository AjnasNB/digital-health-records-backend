const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middlewares/auth');
const {
  uploadHealthRecord,
  getUserHealthRecords,
  getHealthRecordById,
  deleteHealthRecord,
  getFullHealthRecordById,
  getCallVerificationStatus,
  initiateCallVerification
} = require('../controllers/healthRecordController');

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for multer
const fileFilter = (req, file, cb) => {
  // Accept images and PDFs only
  if (
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg'
  ) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Please upload a PDF or image file.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// @route   POST /api/health-records/upload
// @desc    Upload a new health record
// @access  Private
router.post('/upload', protect, upload.single('file'), uploadHealthRecord);

// @route   GET /api/health-records
// @desc    Get all user health records
// @access  Private
router.get('/', protect, getUserHealthRecords);

// @route   GET /api/health-records/:id
// @desc    Get a specific health record
// @access  Private
router.get('/:id', protect, getHealthRecordById);

// @route   GET /api/health-records/:id/full
// @desc    Get a specific health record with complete processing data
// @access  Private
router.get('/:id/full', protect, getFullHealthRecordById);

// @route   DELETE /api/health-records/:id
// @desc    Delete a health record
// @access  Private
router.delete('/:id', protect, deleteHealthRecord);

// Call verification routes
router.post('/:id/verify', protect, initiateCallVerification);
router.get('/:id/verify/status', protect, getCallVerificationStatus);

module.exports = router; 