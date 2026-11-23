import Email from '../models/Email.js';
import { preFilterEmail, analyzeEmailWithAI } from './ai.js';
import { dispatchMultiChannelAlerts } from './notifier.js';

/**
 * Core Email Processing Pipeline for Mail-E
 *
 * Systematic 5-stage pipeline:
 * 1. Duplicate check (providerMessageId)
 * 2. Pre-filter heuristic (reject marketing/spam noise without AI cost)
 * 3. AI intelligence extraction (Gemini 1.5 Flash / rule fallback)
 * 4. Database persistence (Mongoose Email document)
 * 5. Concurrent multi-channel dispatch (Promise.allSettled -> Telegram & Android SMS)
 *
 * @param {Object} params
 * @param {Object} params.user - User document with notification credentials
 * @param {Object} params.email - Raw email object { providerMessageId, subject, bodyText, sender }
 * @param {Function} [params.addLog] - Optional audit logger
 * @returns {Promise<{ success: boolean, emailDoc?: Object, analysis?: Object, filtered?: boolean, duplicate?: boolean, alerts?: Object }>}
 */
export async function processEmail({ user, email, addLog = () => {} }) {
  const { providerMessageId, subject, bodyText, sender } = email;

  // Stage 1: Email Ingestion & Duplicate Check
  addLog('EMAIL_DETECTED', `📩 New email from ${sender}: "${subject}"`);

  const existing = await Email.findOne({ providerMessageId });
  if (existing) {
    addLog('DUPLICATE_CHECK', '⚠️ Message already processed. Skipping.', 'warning');
    return { success: false, duplicate: true, emailDoc: existing };
  }
  addLog('DUPLICATE_CHECK', '✓ Unseen message confirmed');

  // Stage 2: Heuristic Pre-Filter with Custom Rules
  const filterResult = preFilterEmail(subject, bodyText, sender, user?.customRules);
  if (!filterResult.isRelevant) {
    addLog('PRE_FILTER', `🚫 Filtered: ${filterResult.reason}`, 'rejected');
    addLog('AI_SKIPPED', '🛡️ AI extraction skipped for non-placement noise', 'info');

    const filteredDoc = await Email.create({
      userId: user?._id || null,
      providerMessageId,
      sender,
      subject,
      snippet: (bodyText || '').slice(0, 160).replace(/\s+/g, ' ').trim(),
      bodyText,
      status: 'filtered',
      category: 'promotional',
      priority: 'low',
      filterReason: filterResult.reason,
      processedAt: new Date()
    });

    return { success: true, filtered: true, emailDoc: filteredDoc };
  }

  addLog('PRE_FILTER', `✓ Passed filter: ${filterResult.reason}`, 'success');

  // Stage 3: AI Intelligence Extraction
  addLog('AI_ANALYZING', '🧠 Extracting placement intelligence...', 'processing');
  const analysis = await analyzeEmailWithAI(subject, bodyText, sender);
  addLog('AI_COMPLETE', `🎯 Classified: [${analysis.category.toUpperCase()}] • Priority: [${analysis.priority.toUpperCase()}]`, 'success');

  // Stage 4: Database Persistence
  const emailDoc = await Email.create({
    userId: user?._id || null,
    providerMessageId,
    sender,
    subject,
    snippet: (bodyText || '').slice(0, 160).replace(/\s+/g, ' ').trim(),
    bodyText,
    status: 'analyzed',
    category: analysis.category,
    priority: analysis.priority,
    aiAnalysis: analysis,
    processedAt: new Date()
  });

  // Stage 5: Multi-Channel Alert Dispatch (Concurrent via Promise.allSettled)
  let alerts = null;
  const isActionable =
    (analysis.category === 'placement' || analysis.category === 'interview') &&
    (analysis.priority === 'high' || analysis.priority === 'medium');

  if (isActionable) {
    addLog('CONCURRENT_DISPATCH', '⚡ Dispatching Telegram & SMS concurrently via Promise.allSettled()...', 'processing');
    alerts = await dispatchMultiChannelAlerts({
      user,
      emailDoc,
      analysis,
      addLog
    });

    emailDoc.status = 'alerted';
    emailDoc.alertSent = true;
    await emailDoc.save();
  } else {
    addLog('ALERT_DECISION', 'ℹ️ Email stored without urgent alert trigger', 'info');
  }

  return {
    success: true,
    filtered: false,
    emailDoc,
    analysis,
    alerts
  };
}
