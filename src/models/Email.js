import mongoose from 'mongoose';

const EmailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  providerMessageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sender: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  snippet: {
    type: String,
    default: ''
  },
  bodyText: {
    type: String,
    default: ''
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['detected', 'filtered', 'analyzed', 'alerted', 'failed'],
    default: 'detected'
  },
  category: {
    type: String,
    enum: ['placement', 'interview', 'assessment', 'promotional', 'other'],
    default: 'other'
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'low'
  },
  // Structured Extraction fields
  aiAnalysis: {
    company: { type: String, default: null },
    role: { type: String, default: null },
    package: { type: String, default: null },
    location: { type: String, default: null },
    assessmentDate: { type: String, default: null },
    interviewDate: { type: String, default: null },
    applicationDeadline: { type: String, default: null },
    eligibility: [{ type: String }],
    action: { type: String, default: null },
    applicationLink: { type: String, default: null }
  },
  alertSent: {
    type: Boolean,
    default: false
  },
  filterReason: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.models.Email || mongoose.model('Email', EmailSchema);
