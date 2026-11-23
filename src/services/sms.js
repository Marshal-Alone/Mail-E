/**
 * SMS Notification Service for Mail-E
 *
 * Dispatches placement SMS alerts directly to an Android smartphone running
 * an open-source SMS Gateway app on local Wi-Fi using HTTP Basic Authentication
 * and dual-SIM routing.
 */

let SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL || 'http://10.69.134.73:8080';
const SMS_USERNAME = process.env.SMS_GATEWAY_USERNAME || 'sms';
const SMS_PASSWORD = process.env.SMS_GATEWAY_PASSWORD || '123456789';
const SIM_NUMBER = parseInt(process.env.SMS_GATEWAY_SIM_NUMBER || '2', 10);

// HTTP Basic Authentication header (RFC 7617)
const authHeader = Buffer.from(`${SMS_USERNAME}:${SMS_PASSWORD}`).toString('base64');

export function getSmsGatewayUrl() {
  return SMS_GATEWAY_URL;
}

export function setSmsGatewayUrl(url) {
  if (url && typeof url === 'string') {
    SMS_GATEWAY_URL = url.trim().replace(/\/+$/, '');
  }
  return SMS_GATEWAY_URL;
}

/**
 * Format structured AI analysis into a concise, high-impact SMS message
 */
export function formatSmsAlert(analysis) {
  const {
    company = 'Company Notice',
    role = 'Opportunity',
    package: ctc = 'Competitive',
    applicationDeadline,
    action
  } = analysis;

  let msg = `🎓 [MAIL-E PLACEMENT ALERT]\n`;
  msg += `🏢 ${company}\n`;
  msg += `💼 Role: ${role}\n`;
  msg += `💰 Package: ${ctc}\n`;

  if (applicationDeadline) {
    msg += `⏳ Deadline: ${applicationDeadline}\n`;
  }

  if (action) {
    msg += `⚡ Action: ${action}`;
  }

  return msg.trim();
}

/**
 * Send SMS alert to student's phone via Android SMS Gateway
 *
 * @param {string} phoneNumber - Recipient phone number (e.g. +918788516418)
 * @param {string} messageText - Alert text content
 * @returns {Promise<{ success: boolean, status: string, deliveryId?: string, phone: string, error?: string }>}
 */
export async function sendSmsAlert(phoneNumber, messageText) {
  const phone = phoneNumber || process.env.STUDENT_PHONE || '+918788516418';

  try {
    const response = await fetch(`${SMS_GATEWAY_URL}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`
      },
      body: JSON.stringify({
        phoneNumbers: [phone],
        message: messageText,
        simNumber: SIM_NUMBER,
        withDeliveryReport: true
      }),
      signal: AbortSignal.timeout(4000)
    });
    console.log("URL : " + `${SMS_GATEWAY_URL}/message`);


    const data = await response.json().catch(() => ({}));
    console.log("DATA : ", data);
    if (response.ok) {
      return {
        success: true,
        status: 'sent',
        deliveryId: `SMS-${Date.now().toString().slice(-6)}`,
        phone
      };
    } else {
      console.warn(`[SMS Gateway] Device returned error (${response.status}):`, data.message);
    }
  } catch (err) {
    console.warn(`[SMS Gateway] Phone unreachable at ${SMS_GATEWAY_URL} (${err.message}). Using simulation fallback.`);
  }

  // Graceful fallback when the mobile gateway is offline
  return {
    success: false,
    status: 'offline',
    simulated: true,
    deliveryId: null,
    phone,
    error: `Device unreachable at ${SMS_GATEWAY_URL} (phone offline on local Wi-Fi)`
  };
}

/**
 * Health check: verify if the Android phone's gateway is reachable on local Wi-Fi
 */
export async function checkSmsServerHealth() {
  try {
    const res = await fetch(`${SMS_GATEWAY_URL}/message`, {
      method: 'GET',
      headers: { Authorization: `Basic ${authHeader}` },
      signal: AbortSignal.timeout(3500)
    });
    // Real Android SMS Gateway returns 200 (or 401 if credentials mismatch).
    // Cloudflare Edge blocks private RFC1918 IPs with 403/400, which are NOT online.
    if (res.ok || res.status === 200 || res.status === 401) {
      return { online: true, url: SMS_GATEWAY_URL };
    }
    return { online: false, url: SMS_GATEWAY_URL, error: `HTTP ${res.status}: Private network or gateway unreachable` };
  } catch (err) {
    return { online: false, url: SMS_GATEWAY_URL, error: err.message };
  }
}
