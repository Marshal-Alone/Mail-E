import express from 'express';
import User from '../models/User.js';
import Email from '../models/Email.js';
import { getAuthUrl, getTokensFromCode, fetchRecentEmails, getGmailProfile } from '../services/gmail.js';
import { sendTelegramAlert } from '../services/telegram.js';
import { sendSmsAlert, checkSmsServerHealth, getSmsGatewayUrl, setSmsGatewayUrl } from '../services/sms.js';
import { processEmail } from '../services/emailProcessor.js';
import { getMonitorStatus, pollInbox, updateMonitorConfig } from '../services/monitor.js';

const router = express.Router();

/**
 * Get or create default student user profile
 */
async function getOrCreateDefaultUser() {
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      name: 'Campus Student',
      email: 'student.placement@college.edu',
      phoneNumber: process.env.STUDENT_PHONE || '+918788516418'
    });
  } else if (!user.phoneNumber) {
    user.phoneNumber = process.env.STUDENT_PHONE || '+918788516418';
    await user.save();
  }
  return user;
}

/**
 * GET /api/status - Live health and channel status
 */
router.get('/status', async (req, res) => {
  const user = await getOrCreateDefaultUser();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  const gmailConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== '');
  const smsHealth = await checkSmsServerHealth();

  res.json({
    ok: true,
    mongo: true,
    gemini: geminiConfigured,
    gmail: {
      configured: gmailConfigured,
      connected: Boolean(user.oauthTokens && user.oauthTokens.access_token),
      email: user.gmailEmail
    },
    telegram: {
      configured: telegramConfigured,
      connected: Boolean(user.telegramChatId),
      chatId: user.telegramChatId
    },
    sms: {
      configured: true,
      online: smsHealth.online,
      gatewayUrl: smsHealth.url,
      phoneNumber: user.phoneNumber,
      smsAlertsEnabled: user.smsAlertsEnabled
    },
    monitor: getMonitorStatus()
  });
});

/**
 * GET /api/emails - Fetch received emails with classification decisions & metrics
 */
router.get('/emails', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 500;
    const query = {};
    if (req.query.category) query.category = req.query.category;
    if (req.query.status) query.status = req.query.status;

    const emails = await Email.find(query).sort({ processedAt: -1, createdAt: -1 }).limit(limit);
    const total = await Email.countDocuments();
    const placements = await Email.countDocuments({ category: 'placement' });
    const interviews = await Email.countDocuments({ category: 'interview' });
    const noise = await Email.countDocuments({ status: 'filtered' });

    res.json({
      ok: true,
      stats: { total, placements, interviews, noise },
      emails
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/emails - Clear email history for a clean slate
 */
router.delete('/emails', async (req, res) => {
  try {
    await Email.deleteMany({});
    res.json({ ok: true, message: 'All email history cleared' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Preset email templates for simulation and testing
 */
const PRESET_TEMPLATES = {
  tcs: {
    sender: 'campus-placements@college.edu',
    subject: 'URGENT: TCS Digital & Ninja Campus Recruitment Drive 2026 - Registration Mandatory',
    bodyText: `Dear Final Year Students,\n\nTata Consultancy Services (TCS) is commencing campus recruitment for 2026 batch.\nRole: Software Engineer - Digital\nPackage: ₹7.5 LPA\nDeadline: 25 September 2026\nAssessment Date: 3 October 2026\nAction Required: Register on TCS NextStep portal.`
  },
  amazon: {
    sender: 'university-talent@amazon.com',
    subject: 'Shortlist Announcement & Technical Interview Schedule: Amazon SDE Campus Hiring',
    bodyText: `Congratulations!\n\nYou are shortlisted for final virtual interview rounds for Software Development Engineer (SDE-1) at Amazon.\nPackage: ₹28.5 LPA\nInterview Date: 28 September 2026, 10:00 AM\nAction Required: Confirm interview slot and upload resume.`
  },
  noise: {
    sender: 'offers@newsletter.swiggy.in',
    subject: 'Flat 50% OFF on your favorite weekend meal! Use code CRAVINGS50',
    bodyText: `Hey Foodie,\n\nEnjoy flat 50% discount up to ₹100 on orders above ₹199 from top restaurants near campus.\nUnsubscribe here.`
  }
};

/**
 * POST /api/simulate - Run an email through the 5-stage pipeline
 */
router.post('/simulate', async (req, res) => {
  const { scenario = 'tcs', sender, subject, bodyText } = req.body;

  let emailData;
  if (subject && bodyText) {
    emailData = {
      sender: sender ? sender.trim() : 'placements@campus.edu',
      subject: subject.trim(),
      bodyText: bodyText.trim()
    };
  } else {
    emailData = PRESET_TEMPLATES[scenario] || PRESET_TEMPLATES.tcs;
  }

  const user = await getOrCreateDefaultUser();
  const providerMessageId = `sim_${scenario}_${Date.now()}`;
  const logs = [];

  const addLog = (stage, detail, status = 'success') => {
    logs.push({
      timestamp: new Date().toLocaleTimeString(),
      stage,
      detail,
      status
    });
  };

  const result = await processEmail({
    user,
    email: {
      providerMessageId,
      sender: emailData.sender,
      subject: emailData.subject,
      bodyText: emailData.bodyText
    },
    addLog
  });

  res.json({
    success: true,
    preFilterPassed: !result.filtered,
    aiSkipped: Boolean(result.filtered),
    logs,
    analysis: result.analysis || null,
    email: result.emailDoc,
    alert: result.alerts?.telegram || null,
    sms: result.alerts?.sms || null
  });
});

/**
 * GET /api/gmail/connect - Redirect to Google OAuth authorization page
 */
router.get('/gmail/connect', (req, res) => {
  const url = getAuthUrl();
  if (!url) {
    return res.status(400).send('Google Client ID/Secret not configured in .env');
  }
  res.redirect(url);
});

/**
 * GET /api/gmail/callback - Google OAuth callback handler
 */
router.get('/gmail/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokens = await getTokensFromCode(code);
    const user = await getOrCreateDefaultUser();
    user.oauthTokens = tokens;
    user.gmailConnected = true;

    try {
      const profile = await getGmailProfile(tokens);
      if (profile?.emailAddress) {
        user.gmailEmail = profile.emailAddress;
      }
    } catch (profErr) {
      console.warn('Could not read profile address:', profErr.message);
    }

    await user.save();
    res.redirect('/?connected=gmail');
  } catch (err) {
    res.status(500).send(`OAuth Error: ${err.message}`);
  }
});

/**
 * POST /api/gmail/check - Manual trigger to scan user's connected Gmail
 */
router.post('/gmail/check', async (req, res) => {
  try {
    const user = await getOrCreateDefaultUser();
    if (!user.oauthTokens?.access_token) {
      return res.status(400).json({ ok: false, message: 'Gmail account not connected yet' });
    }

    const newEmails = await fetchRecentEmails(user.oauthTokens, 5);
    const processed = [];

    for (const email of newEmails) {
      const result = await processEmail({ user, email });
      if (!result.duplicate) {
        processed.push(result.emailDoc);
      }
    }

    res.json({ ok: true, found: newEmails.length, processed: processed.length, emails: processed });
  } catch (err) {
    if (err.message && (err.message.includes('invalid_grant') || err.message.includes('No refresh token'))) {
      const user = await getOrCreateDefaultUser();
      user.gmailConnected = false;
      await user.save();
      return res.status(401).json({
        ok: false,
        message: 'Gmail session expired. Please click "Authorise Gmail with Google" to grant fresh access.'
      });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/telegram/set-chat-id - Save student Telegram Chat ID
 */
router.post('/telegram/set-chat-id', async (req, res) => {
  const { chatId } = req.body;
  if (!chatId) {
    return res.status(400).json({ ok: false, message: 'chatId is required' });
  }

  const user = await getOrCreateDefaultUser();
  user.telegramChatId = chatId.trim();
  await user.save();

  res.json({ ok: true, chatId: user.telegramChatId });
});

/**
 * POST /api/telegram/test - Dispatch test alert to Telegram
 */
router.post('/telegram/test', async (req, res) => {
  const user = await getOrCreateDefaultUser();
  if (!user.telegramChatId) {
    return res.status(400).json({ ok: false, message: 'Set your Telegram Chat ID first' });
  }
  const testMsg = `🚨 *MAIL-E TEST NOTIFICATION*\n\n✅ Telegram channel is connected and ready for placement alerts!`;
  const result = await sendTelegramAlert(user.telegramChatId, testMsg);
  res.json({ ok: true, result });
});

/**
 * POST /api/sms/set-phone - Save student mobile number for SMS alerts
 */
router.post('/sms/set-phone', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ ok: false, message: 'Phone number is required' });
  }

  const user = await getOrCreateDefaultUser();
  user.phoneNumber = phone.trim();
  user.smsAlertsEnabled = true;
  await user.save();

  res.json({ ok: true, phoneNumber: user.phoneNumber, message: 'Phone number saved for SMS alerts' });
});

/**
 * POST /api/sms/test - Dispatch test SMS via Android Gateway
 */
router.post('/sms/test', async (req, res) => {
  const user = await getOrCreateDefaultUser();
  const testMsg = `📱 [MAIL-E TEST SMS]\nConnected successfully to Android SMS Gateway! Phone: ${user.phoneNumber}`;
  const result = await sendSmsAlert(user.phoneNumber, testMsg);
  res.json({ ok: true, result });
});

/**
 * POST /api/sms/set-gateway - Configure phone SMS Gateway URL
 */
router.post('/sms/set-gateway', (req, res) => {
  const { gatewayUrl } = req.body;
  if (!gatewayUrl) {
    return res.status(400).json({ ok: false, message: 'Gateway URL is required' });
  }
  const updated = setSmsGatewayUrl(gatewayUrl);
  res.json({ ok: true, gatewayUrl: updated, message: 'Gateway URL updated successfully' });
});

/**
 * GET/POST /api/sms/heartbeat - Auto-register Android device dynamic IP
 */
router.all('/sms/heartbeat', (req, res) => {
  const urlParam = req.query.url || req.query.ip || req.body?.url || req.body?.ip;
  if (!urlParam) {
    return res.status(400).json({
      ok: false,
      currentGatewayUrl: getSmsGatewayUrl(),
      message: 'Pass ?url=http://<phone-ip>:8080 or ?ip=<phone-ip> to auto-register'
    });
  }
  let fullUrl = urlParam.trim();
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `http://${fullUrl}`;
  }
  if (!fullUrl.includes(':', 7)) {
    fullUrl = `${fullUrl}:8080`;
  }
  const updated = setSmsGatewayUrl(fullUrl);
  res.json({
    ok: true,
    gatewayUrl: updated,
    message: `Phone gateway auto-registered to ${updated}`
  });
});

/**
 * GET /api/sms/check-health - Probe phone gateway reachability
 */
router.get('/sms/check-health', async (req, res) => {
  const health = await checkSmsServerHealth();
  res.json({ ok: true, ...health });
});

/**
 * POST /api/monitor/config - Update background polling interval or pause/resume
 */
router.post('/monitor/config', (req, res) => {
  const { intervalMinutes, isRunning } = req.body;
  const status = updateMonitorConfig({ intervalMinutes, isRunning });
  res.json({ ok: true, monitor: status, message: `Monitor updated: polling every ${status.pollIntervalMinutes}m` });
});

/**
 * GET /api/monitor/status - Check background monitor status
 */
router.get('/monitor/status', (req, res) => {
  res.json({ ok: true, monitor: getMonitorStatus() });
});

/**
 * POST /api/monitor/poll - Trigger immediate monitor cycle
 */
router.post('/monitor/poll', async (req, res) => {
  try {
    const result = await pollInbox();
    res.json({ ok: true, result, monitor: getMonitorStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
