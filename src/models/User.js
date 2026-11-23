import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Student User'
  },
  email: {
    type: String,
    default: 'student@campus.edu'
  },
  phoneNumber: {
    type: String,
    default: process.env.STUDENT_PHONE || '+918788516418'
  },
  smsAlertsEnabled: {
    type: Boolean,
    default: true
  },
  smsGatewayUrl: {
    type: String,
    default: null
  },
  telegramChatId: {
    type: String,
    default: null
  },
  gmailConnected: {
    type: Boolean,
    default: false
  },
  gmailEmail: {
    type: String,
    default: null
  },
  oauthTokens: {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    expiry_date: Number
  },
  lastCheckedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const mg = mongoose?.default || mongoose;
export default (mg.models && mg.models.User) ? mg.models.User : mg.model('User', UserSchema);
