const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  documentType: {
    type: String,
    enum: [
      'Medical Report', 
      'Prescription', 
      'Lab Result', 
      'Vaccination Record',
      'Insurance Document',
      'Consultation Note',
      'Discharge Summary',
      'Medical Bill',
      'Other'
    ],
    default: 'Medical Report'
  },
  patientName: {
    type: String,
    trim: true
  },
  patientPhone: {
    type: String,
    trim: true
  },
  fileUrl: {
    type: String
  },
  filePath: {
    type: String
  },
  extractedData: {
    type: Object
  },
  structuredData: {
    type: Object
  },
  processingMetadata: {
    type: Object,
    default: {}
  },
  // Call verification related fields
  verificationCall: {
    callId: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['not_initiated', 'registered', 'ongoing', 'ended', 'error'],
      default: 'not_initiated'
    },
    startTime: {
      type: Date,
      default: null
    },
    endTime: {
      type: Date,
      default: null
    },
    transcript: {
      type: String,
      default: null
    },
    transcriptObject: {
      type: Array,
      default: null
    },
    recordingUrl: {
      type: String,
      default: null
    },
    verificationComplete: {
      type: Boolean,
      default: false
    },
    corrections: {
      type: Array,
      default: []
    },
    additionalInfo: {
      type: String,
      default: ''
    },
    summary: {
      type: String,
      default: ''
    },
    metadata: {
      type: Object,
      default: {}
    }
  },
  // Status tracker for the document processing pipeline
  processingStatus: {
    type: String,
    enum: [
      'uploaded',
      'document_ai_complete', 
      'verification_initiated',
      'verification_complete', 
      'groq_processing_complete',
      'complete'
    ],
    default: 'uploaded'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const HealthRecord = mongoose.model('HealthRecord', healthRecordSchema);

module.exports = HealthRecord; 