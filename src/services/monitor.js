import { fetchRecentEmails } from './gmail.js';
import { processEmail } from './emailProcessor.js';
import User from '../models/User.js';

/**
 * Autonomous Background Email Monitor for Mail-E
 * Periodically polls authorized Gmail accounts, detects placement emails,
 * extracts recruitment criteria via AI, and dispatches Telegram + SMS alerts.
 */

let monitorIntervalId = null;
let isPolling = false;

const monitorStats = {
  isRunning: false,
  lastPollTime: null,
  lastPollStatus: 'idle',
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '3', 10),
  totalProcessedCount: 0,
  totalAlertsDispatched: 0,
  lastError: null
};

/**
 * Polling cycle: scans authorized Gmail inboxes
 */
export async function pollInbox() {
  if (isPolling) {
    return { ok: false, message: 'Polling already in progress' };
  }

  isPolling = true;
  monitorStats.lastPollTime = new Date();
  monitorStats.lastPollStatus = 'polling';

  try {
    const users = await User.find({
      $or: [
        { gmailConnected: true },
        { 'oauthTokens.access_token': { $exists: true, $ne: null } }
      ]
    });

    if (!users || users.length === 0) {
      monitorStats.lastPollStatus = 'waiting_for_connected_users';
      isPolling = false;
      return { ok: true, message: 'No authorized Gmail accounts found' };
    }

    let cycleProcessed = 0;
    let cycleAlerts = 0;

    for (const user of users) {
      try {
        if (!user.oauthTokens || !user.oauthTokens.access_token) continue;

        const recentEmails = await fetchRecentEmails(user.oauthTokens, 5);

        for (const rawEmail of recentEmails) {
          const result = await processEmail({
            user,
            email: rawEmail
          });

          if (result.duplicate) continue;

          cycleProcessed++;
          monitorStats.totalProcessedCount++;

          if (result.alerts) {
            cycleAlerts++;
            monitorStats.totalAlertsDispatched++;
          }
        }

        user.lastCheckedAt = new Date();
        await user.save();
      } catch (userErr) {
        if (userErr.message && (userErr.message.includes('invalid_grant') || userErr.message.includes('No refresh token'))) {
          user.gmailConnected = false;
          await user.save();
          console.warn(`[Monitor] OAuth token expired for ${user.email}. Waiting for user re-authorization.`);
        } else {
          console.warn(`[Monitor] Error checking inbox for ${user.email}:`, userErr.message);
        }
      }
    }

    monitorStats.lastPollStatus = 'success';
    monitorStats.lastError = null;
    isPolling = false;
    return { ok: true, processed: cycleProcessed, alerts: cycleAlerts };
  } catch (err) {
    console.error('[Monitor] Polling error:', err);
    monitorStats.lastPollStatus = 'error';
    monitorStats.lastError = err.message;
    isPolling = false;
    return { ok: false, error: err.message };
  }
}

/**
 * Start the background polling schedule
 */
export function startBackgroundMonitor(intervalMinutes = null) {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
  }

  const mins = intervalMinutes || monitorStats.pollIntervalMinutes;
  monitorStats.pollIntervalMinutes = mins;
  const intervalMs = Math.max(1, mins) * 60 * 1000;

  monitorStats.isRunning = true;
  console.log(`[Monitor] Background email monitor active (every ${mins} minute(s))`);

  // Initial check after 5 seconds
  setTimeout(() => {
    pollInbox().catch(err => console.warn('[Monitor] Initial poll error:', err.message));
  }, 5000);

  // Periodic recurring check
  monitorIntervalId = setInterval(() => {
    pollInbox().catch(err => console.warn('[Monitor] Periodic poll error:', err.message));
  }, intervalMs);
}

/**
 * Stop background monitor
 */
export function stopBackgroundMonitor() {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }
  monitorStats.isRunning = false;
  console.log('[Monitor] Background monitor paused.');
}

/**
 * Configure monitor interval and active state
 */
export function updateMonitorConfig({ intervalMinutes, isRunning } = {}) {
  if (intervalMinutes !== undefined) {
    const mins = Math.max(1, parseInt(intervalMinutes, 10) || 3);
    monitorStats.pollIntervalMinutes = mins;
  }

  if (isRunning === false) {
    stopBackgroundMonitor();
  } else if (isRunning === true || (intervalMinutes !== undefined && monitorStats.isRunning)) {
    startBackgroundMonitor(monitorStats.pollIntervalMinutes);
  }

  return getMonitorStatus();
}

/**
 * Return live monitor telemetry
 */
export function getMonitorStatus() {
  return {
    ...monitorStats,
    isPolling
  };
}
