import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  emailId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Email',
    required: true
  },
  channel: {
    type: String,
    enum: ['telegram', 'sms', 'simulation'],
    default: 'telegram'
  },
  status: {
    type: String,
    enum: ['sent', 'simulated', 'failed'],
    default: 'sent'
  },
  messageText: {
    type: String,
    required: true
  },
  deliveryId: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.models.Alert || mongoose.model('Alert', AlertSchema);
