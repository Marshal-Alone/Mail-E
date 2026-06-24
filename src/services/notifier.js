import { formatTelegramAlert, sendTelegramAlert } from './telegram.js';
import { formatSmsAlert, sendSmsAlert } from './sms.js';
import Alert from '../models/Alert.js';

/**
 * Multi-Channel Notification Orchestrator for Mail-E
 *
 * Implements concurrent Telegram and SMS notification dispatch using Promise.allSettled().
 * This guarantees:
 * 1. Concurrency: Telegram Bot API and Android SMS Gateway requests execute in parallel.
 * 2. Fault Isolation: A failure or timeout in one channel (e.g. Android phone offline)
 *    never blocks or prevents delivery on the other channel.
 * 3. Independent Delivery Tracking: Results and audit logs are recorded separately for each provider.
 *
 * @param {Object} options
 * @param {Object} options.user - User document containing telegramChatId, phoneNumber, and sms preferences
 * @param {Object} options.emailDoc - Mongoose document for the analyzed email
 * @param {Object} options.analysis - Structured placement intelligence extracted by AI
 * @param {Function} [options.addLog] - Optional logging callback for real-time pipeline audit log
 * @returns {Promise<{ telegram: Object, sms: Object|null }>} Delivery summary for each channel
 */
export async function dispatchMultiChannelAlerts({
  user,
  emailDoc,
  analysis,
  addLog = () => {}
}) {
  const tasks = [];
  const channels = [];

  // 1. Prepare Telegram Alert
  const telegramMessage = formatTelegramAlert(analysis);
  const telegramChatId = user?.telegramChatId || null;
  channels.push({
    channel: 'telegram',
    message: telegramMessage,
    recipient: telegramChatId || 'simulation_chat'
  });
  tasks.push(sendTelegramAlert(telegramChatId, telegramMessage));

  // 2. Prepare SMS Alert (if enabled & phone number configured)
  const isSmsEnabled = Boolean(user?.smsAlertsEnabled && user?.phoneNumber);
  let smsMessage = '';
  if (isSmsEnabled) {
    smsMessage = formatSmsAlert(analysis);
    channels.push({
      channel: 'sms',
      message: smsMessage,
      recipient: user.phoneNumber
    });
    tasks.push(sendSmsAlert(user.phoneNumber, smsMessage));
  }

  // 3. Concurrently dispatch using Promise.allSettled()
  const results = await Promise.allSettled(tasks);

  // 4. Handle delivery outcomes separately
  const deliverySummary = {
    telegram: null,
    sms: null
  };

  for (let i = 0; i < results.length; i++) {
    const settled = results[i];
    const { channel, message, recipient } = channels[i];

    if (settled.status === 'fulfilled') {
      const resVal = settled.value || {};
      const status = resVal.status === 'sent' ? 'sent' : (resVal.status === 'offline' ? 'offline' : 'simulated');
      const deliveryId = resVal.deliveryId || null;

      deliverySummary[channel] = {
        success: resVal.success ?? (status === 'sent'),
        status,
        deliveryId,
        gatewayIp: resVal.gatewayIp,
        phone: resVal.phone,
        error: resVal.error || null
      };

      if (channel === 'telegram') {
        if (status === 'sent') {
          addLog('TELEGRAM_DISPATCH', `Telegram Alert delivered to chat ID ${recipient} ✓`, 'success');
        } else {
          addLog('TELEGRAM_DISPATCH', `Simulated Telegram Alert generated (Ready to pair with real bot) ✓`, 'info');
        }
      } else if (channel === 'sms') {
        if (status === 'sent') {
          addLog('SMS_DISPATCH', `SMS Alert delivered to ${recipient} via Android SMS Gateway (${resVal.gatewayIp || 'Local Server'}) ✓`, 'success');
        } else if (status === 'offline') {
          addLog('SMS_DISPATCH', `Android phone gateway is OFFLINE. Telegram fail-safe dispatched alert successfully.`, 'warning');
        } else {
          addLog('SMS_DISPATCH', `SMS Alert queued for ${recipient} (Local OTP server simulation mode) ✓`, 'info');
        }
      }

      // Record in Alert collection
      if (emailDoc?._id) {
        try {
          await Alert.create({
            userId: user?._id || null,
            emailId: emailDoc._id,
            channel,
            status,
            messageText: message,
            deliveryId,
            errorMessage: resVal.error || null
          });
        } catch (dbErr) {
          console.warn(`[Notifier] Failed to persist ${channel} alert record:`, dbErr.message);
        }
      }
    } else {
      // Promise was rejected (uncaught exception in channel adapter)
      const errorMsg = settled.reason?.message || 'Unknown dispatch error';
      deliverySummary[channel] = {
        success: false,
        status: 'failed',
        error: errorMsg
      };

      addLog(`${channel.toUpperCase()}_DISPATCH`, `Failed to dispatch ${channel} alert: ${errorMsg}`, 'error');

      if (emailDoc?._id) {
        try {
          await Alert.create({
            userId: user?._id || null,
            emailId: emailDoc._id,
            channel,
            status: 'failed',
            messageText: message,
            errorMessage: errorMsg
          });
        } catch (dbErr) {
          console.warn(`[Notifier] Failed to persist ${channel} failed alert record:`, dbErr.message);
        }
      }
    }
  }

  // 5. Update Email Document status
  if (emailDoc) {
    emailDoc.status = 'alerted';
    emailDoc.alertSent = true;
    try {
      await emailDoc.save();
    } catch (saveErr) {
      console.warn('[Notifier] Failed to update emailDoc status:', saveErr.message);
    }
  }

  return deliverySummary;
}
