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
  smsCloudConfig: {
    enabled: { type: Boolean, default: true },
    serverUrl: { type: String, default: 'https://api.sms-gate.app' },
    username: { type: String, default: '7-U_KR' },
    password: { type: String, default: 'ff7tccaalb7cct' },
    deviceId: { type: String, default: 'h4l1sFkuCjylnM_I0TYi-' }
  },
  customRules: {
    blockedSenders: {
      type: [String],
      default: ['contentnc@naukri.com', 'naukri.com', 'digest@internshala.com']
    },
    blockedKeywords: {
      type: [String],
      default: ['tips to crack', 'aptitude test', 'mock test', 'preparation guide', 'masterclass']
    },
    allowedSenders: {
      type: [String],
      default: []
    },
    allowedKeywords: {
      type: [String],
      default: []
    }
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
