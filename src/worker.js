import { Hono } from 'hono';
import { cors } from 'hono/cors';
import mongoose from 'mongoose';
import User from './models/User.js';
import Email from './models/Email.js';
import { getAuthUrl, getTokensFromCode, fetchRecentEmails, getGmailProfile } from './services/gmail.js';
import { sendTelegramAlert } from './services/telegram.js';
import { sendSmsAlert, checkSmsServerHealth, setSmsGatewayUrl } from './services/sms.js';
import { processEmail } from './services/emailProcessor.js';
import { getMonitorStatus, pollInbox, updateMonitorConfig } from './services/monitor.js';

const app = new Hono();

// Preset templates for simulation
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

const mg = mongoose?.default || mongoose;
let isDbConnected = false;

/**
 * Connect to MongoDB Atlas via Cloudflare Workers TCP socket
 */
async function ensureDbConnected(env) {
  const uri = env?.MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    return false;
  }
  const connection = mg.connection || mg.default?.connection;
  if (connection && connection.readyState === 1) {
    isDbConnected = true;
    return true;
  }
  try {
    const connectFn = mg.connect || mg.default?.connect;
    if (!connectFn) return false;
    await connectFn(uri, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false
    });
    isDbConnected = true;
    return true;
  } catch (err) {
    isDbConnected = false;
    console.warn('⚠️ Cloudflare Worker MongoDB warning:', err.message);
    return false;
  }
}

/**
 * Retrieve or create default user profile
 */
async function getOrCreateDefaultUser() {
  try {
    let user = await User.findOne();
    if (!user) {
      user = await User.create({
        name: 'Campus Student',
        email: 'student.placement@college.edu',
        phoneNumber: process.env.STUDENT_PHONE || '+918788516418',
        smsGatewayUrl: process.env.SMS_GATEWAY_URL || 'http://100.95.255.93:8080'
      });
    } else if (!user.phoneNumber) {
      user.phoneNumber = process.env.STUDENT_PHONE || '+918788516418';
      await user.save();
    }
    if (user.smsGatewayUrl) {
      setSmsGatewayUrl(user.smsGatewayUrl);
    }
    return user;
  } catch (err) {
    return {
      name: 'Campus Student',
      email: 'student.placement@college.edu',
      phoneNumber: process.env.STUDENT_PHONE || '+918788516418',
      smsGatewayUrl: getSmsGatewayUrl(),
      smsAlertsEnabled: true,
      telegramChatId: process.env.STUDENT_TELEGRAM_CHAT_ID || null,
      save: async () => {}
    };
  }
}

// Enable CORS
app.use('*', cors());

// Sync Cloudflare Worker bindings into process.env & ensure DB
app.use('*', async (c, next) => {
  if (c.env) {
    for (const [key, value] of Object.entries(c.env)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      }
    }
  }
  await ensureDbConnected(c.env);
  await next();
});

/**
 * GET /api/status - Live health and channel status
 */
app.get('/api/status', async (c) => {
  const user = await getOrCreateDefaultUser();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  const gmailConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== '');
  const smsHealth = await checkSmsServerHealth();

  return c.json({
    ok: true,
    mongo: isDbConnected,
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
    monitor: getMonitorStatus(),
    runtime: 'Cloudflare Workers (Edge)'
  });
});

/**
 * GET /api/emails - Fetch categorized email records
 */
app.get('/api/emails', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '500', 10);
    const query = {};
    const category = c.req.query('category');
    const status = c.req.query('status');
    if (category) query.category = category;
    if (status) query.status = status;

    const emails = await Email.find(query).sort({ processedAt: -1, createdAt: -1 }).limit(limit);
    const total = await Email.countDocuments();
    const placements = await Email.countDocuments({ category: 'placement' });
    const interviews = await Email.countDocuments({ category: 'interview' });
    const noise = await Email.countDocuments({ status: 'filtered' });

    return c.json({
      ok: true,
      stats: { total, placements, interviews, noise },
      emails
    });
  } catch (err) {
    return c.json({
      ok: false,
      error: err.message,
      stats: { total: 0, placements: 0, interviews: 0, noise: 0 },
      emails: []
    }, 500);
  }
});

/**
 * DELETE /api/emails - Clear email history
 */
app.delete('/api/emails', async (c) => {
  try {
    await Email.deleteMany({});
    return c.json({ ok: true, message: 'All email history cleared' });
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

/**
 * POST /api/simulate - Run an email through the 5-stage pipeline
 */
app.post('/api/simulate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { scenario = 'tcs', sender, subject, bodyText } = body;

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

    return c.json({
      success: true,
      preFilterPassed: !result.filtered,
      aiSkipped: Boolean(result.filtered),
      logs,
      analysis: result.analysis || null,
      email: result.emailDoc,
      alert: result.alerts?.telegram || null,
      sms: result.alerts?.sms || null
    });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/gmail/connect - Redirect to Google OAuth
 */
app.get('/api/gmail/connect', (c) => {
  const origin = new URL(c.req.url).origin;
  const autoRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
  const url = getAuthUrl(autoRedirectUri);
  if (!url) {
    return c.text('Google Client ID/Secret not configured in environment', 400);
  }
  return c.redirect(url);
});

/**
 * GET /api/gmail/callback - OAuth callback handler
 */
app.get('/api/gmail/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.text('Missing authorization code', 400);
  }

  try {
    const origin = new URL(c.req.url).origin;
    const autoRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
    const tokens = await getTokensFromCode(code, autoRedirectUri);
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
    return c.redirect('/?connected=gmail');
  } catch (err) {
    return c.text(`OAuth Error: ${err.message}`, 500);
  }
});

/**
 * POST /api/gmail/check - Manual trigger to scan connected Gmail
 */
app.post('/api/gmail/check', async (c) => {
  try {
    const user = await getOrCreateDefaultUser();
    if (!user.oauthTokens?.access_token) {
      return c.json({ ok: false, message: 'Gmail account not connected yet' }, 400);
    }

    const newEmails = await fetchRecentEmails(user.oauthTokens, {
      sinceDate: user.lastCheckedAt,
      maxResults: 30
    });
    const processed = [];

    for (const email of newEmails) {
      const result = await processEmail({ user, email });
      if (!result.duplicate) {
        processed.push(result.emailDoc);
      }
    }

    user.lastCheckedAt = new Date();
    await user.save();

    return c.json({ ok: true, found: newEmails.length, processed: processed.length, emails: processed });
  } catch (err) {
    if (err.message && (err.message.includes('invalid_grant') || err.message.includes('No refresh token'))) {
      const user = await getOrCreateDefaultUser();
      user.gmailConnected = false;
      await user.save();
      return c.json({
        ok: false,
        message: 'Gmail session expired. Please click "Authorise Gmail with Google" to grant fresh access.'
      }, 401);
    }
    return c.json({ ok: false, error: err.message }, 500);
  }
});

/**
 * POST /api/telegram/set-chat-id - Save student Telegram Chat ID
 */
app.post('/api/telegram/set-chat-id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { chatId } = body;
  if (!chatId) {
    return c.json({ ok: false, message: 'chatId is required' }, 400);
  }

  const user = await getOrCreateDefaultUser();
  user.telegramChatId = chatId.trim();
  await user.save();

  return c.json({ ok: true, chatId: user.telegramChatId });
});

/**
 * POST /api/telegram/test - Dispatch test alert to Telegram
 */
app.post('/api/telegram/test', async (c) => {
  const user = await getOrCreateDefaultUser();
  if (!user.telegramChatId) {
    return c.json({ ok: false, message: 'Set your Telegram Chat ID first' }, 400);
  }
  const testMsg = `🚨 *MAIL-E TEST NOTIFICATION*\n\n✅ Telegram channel is connected and ready for placement alerts!`;
  const result = await sendTelegramAlert(user.telegramChatId, testMsg);
  return c.json({ ok: true, result });
});

/**
 * POST /api/sms/set-phone - Save mobile number for SMS alerts
 */
app.post('/api/sms/set-phone', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { phone } = body;
  if (!phone) {
    return c.json({ ok: false, message: 'Phone number is required' }, 400);
  }

  const user = await getOrCreateDefaultUser();
  user.phoneNumber = phone.trim();
  user.smsAlertsEnabled = true;
  await user.save();

  return c.json({ ok: true, phoneNumber: user.phoneNumber, message: 'Phone number saved for SMS alerts' });
});

/**
 * POST /api/sms/test - Dispatch test SMS via Android Gateway
 */
app.post('/api/sms/test', async (c) => {
  const user = await getOrCreateDefaultUser();
  const testMsg = `📱 [MAIL-E TEST SMS]\nConnected successfully to Android SMS Gateway! Phone: ${user.phoneNumber}`;
  const result = await sendSmsAlert(user.phoneNumber, testMsg);
  return c.json({ ok: true, result });
});

/**
 * POST /api/sms/set-gateway - Configure phone SMS Gateway URL
 */
app.post('/api/sms/set-gateway', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { gatewayUrl } = body;
  if (!gatewayUrl) {
    return c.json({ ok: false, message: 'Gateway URL is required' }, 400);
  }
  const updated = setSmsGatewayUrl(gatewayUrl);
  const user = await getOrCreateDefaultUser();
  user.smsGatewayUrl = updated;
  await user.save();
  return c.json({ ok: true, gatewayUrl: updated, message: 'Gateway URL updated and saved permanently to database' });
});

/**
 * GET/POST /api/sms/heartbeat - Auto-register Android device dynamic IP
 * Phone or shortcut can simply call: https://<worker>/api/sms/heartbeat?url=http://10.69.134.xx:8080
 */
app.all('/api/sms/heartbeat', async (c) => {
  let urlParam = c.req.query('url') || c.req.query('ip');
  if (!urlParam && c.req.method === 'POST') {
    const body = await c.req.json().catch(() => ({}));
    urlParam = body.url || body.ip;
  }
  if (!urlParam) {
    const user = await getOrCreateDefaultUser();
    return c.json({
      ok: false,
      currentGatewayUrl: user.smsGatewayUrl || getSmsGatewayUrl(),
      message: 'Pass ?url=http://<phone-ip>:8080 or ?ip=<phone-ip> to auto-register'
    }, 400);
  }
  let fullUrl = urlParam.trim();
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = `http://${fullUrl}`;
  }
  if (!fullUrl.includes(':', 7)) {
    fullUrl = `${fullUrl}:8080`;
  }
  const updated = setSmsGatewayUrl(fullUrl);
  const user = await getOrCreateDefaultUser();
  user.smsGatewayUrl = updated;
  await user.save();
  return c.json({
    ok: true,
    gatewayUrl: updated,
    message: `Phone gateway auto-registered and saved permanently to database: ${updated}`
  });
});

/**
 * GET /api/sms/check-health - Probe phone gateway reachability
 */
app.get('/api/sms/check-health', async (c) => {
  const health = await checkSmsServerHealth();
  return c.json({ ok: true, ...health });
});

/**
 * POST /api/monitor/config - Update background polling interval or state
 */
app.post('/api/monitor/config', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { intervalMinutes, isRunning } = body;
  const status = updateMonitorConfig({ intervalMinutes, isRunning });
  return c.json({ ok: true, monitor: status, message: `Monitor updated: polling every ${status.pollIntervalMinutes}m` });
});

/**
 * GET /api/monitor/status - Check background monitor status
 */
app.get('/api/monitor/status', (c) => {
  return c.json({ ok: true, monitor: getMonitorStatus() });
});

/**
 * POST /api/monitor/poll - Trigger immediate monitor cycle
 */
app.post('/api/monitor/poll', async (c) => {
  try {
    const result = await pollInbox();
    return c.json({ ok: true, result, monitor: getMonitorStatus() });
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Cloudflare Workers entrypoint
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests to Hono router
    if (url.pathname.startsWith('/api')) {
      return app.fetch(request, env, ctx);
    }

    // Serve static frontend assets from env.ASSETS binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },

  /**
   * Cloudflare Cron Trigger (Runs every 3 minutes via "triggers.crons")
   */
  async scheduled(event, env, ctx) {
    console.log(`[Worker Cron] Triggered scheduled poll (${event.cron}) at ${new Date().toISOString()}`);

    if (env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          process.env[key] = value;
        }
      }
    }

    ctx.waitUntil((async () => {
      const dbConnected = await ensureDbConnected(env);
      if (!dbConnected) {
        console.warn('[Worker Cron] Background poll skipped: database not reachable.');
        return;
      }
      const pollResult = await pollInbox();
      console.log('[Worker Cron] Poll result:', JSON.stringify(pollResult));
    })());
  }
};
