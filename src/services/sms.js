/**
 * SMS Notification Service for Mail-E
 *
 * Dispatches placement SMS alerts directly to an Android smartphone running
 * an open-source SMS Gateway app on local Wi-Fi using HTTP Basic Authentication
 * and dual-SIM routing.
 */

let SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app';
let SMS_USERNAME = process.env.SMS_GATEWAY_USERNAME || '7-U_KR';
let SMS_PASSWORD = process.env.SMS_GATEWAY_PASSWORD || 'ff7tccaalb7cct';
let SIM_NUMBER = parseInt(process.env.SMS_GATEWAY_SIM_NUMBER || '2', 10);

function getAuthHeader() {
  const isCloud = SMS_GATEWAY_URL.includes('sms-gate.app');
  const u = isCloud ? (process.env.SMS_CLOUD_USERNAME || SMS_USERNAME || '7-U_KR') : (process.env.SMS_GATEWAY_USERNAME || 'sms');
  const p = isCloud ? (process.env.SMS_CLOUD_PASSWORD || SMS_PASSWORD || 'ff7tccaalb7cct') : (process.env.SMS_GATEWAY_PASSWORD || '123456789');
  return Buffer.from(`${u}:${p}`).toString('base64');
}

export function getSmsGatewayUrl() {
  return SMS_GATEWAY_URL;
}

export function setSmsGatewayUrl(url) {
  if (url && typeof url === 'string') {
    SMS_GATEWAY_URL = url.trim().replace(/\/+$/, '');
  }
  return SMS_GATEWAY_URL;
}

export function configureSmsGateway({ url, username, password, simNumber }) {
  if (url) SMS_GATEWAY_URL = url.trim().replace(/\/+$/, '');
  if (username) SMS_USERNAME = username.trim();
  if (password) SMS_PASSWORD = password.trim();
  if (simNumber) SIM_NUMBER = parseInt(simNumber, 10);
  return { url: SMS_GATEWAY_URL, simNumber: SIM_NUMBER };
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
 * Send SMS alert to student's phone via Android SMS Gateway (Cloud or Local Wi-Fi)
 */
export async function sendSmsAlert(phoneNumber, messageText) {
  const phone = phoneNumber || process.env.STUDENT_PHONE || '+918788516418';
  const isCloud = SMS_GATEWAY_URL.includes('sms-gate.app');
  const postUrl = isCloud ? 'https://api.sms-gate.app/3rdparty/v1/message' : `${SMS_GATEWAY_URL}/message`;

  try {
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${getAuthHeader()}`
      },
      body: JSON.stringify({
        phoneNumbers: [phone],
        message: messageText,
        simNumber: SIM_NUMBER,
        withDeliveryReport: true
      }),
      signal: AbortSignal.timeout(6000)
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return {
        success: true,
        status: 'sent',
        deliveryId: data.id || `SMS-${Date.now().toString().slice(-6)}`,
        phone,
        mode: isCloud ? 'cloud' : 'local'
      };
    } else {
      console.warn(`[SMS Gateway] Device returned error (${response.status}):`, data.message || data.error);
    }
  } catch (err) {
    console.warn(`[SMS Gateway] Unreachable at ${postUrl} (${err.message}). Using simulation fallback.`);
  }

  return {
    success: false,
    status: 'offline',
    simulated: true,
    deliveryId: null,
    phone,
    error: `Device unreachable at ${postUrl}`
  };
}

/**
 * Health check: verify if the Android phone's gateway is reachable (Cloud or Local Wi-Fi)
 */
export async function checkSmsServerHealth() {
  const isCloud = SMS_GATEWAY_URL.includes('sms-gate.app');
  const checkUrl = isCloud ? 'https://api.sms-gate.app/3rdparty/v1/device' : `${SMS_GATEWAY_URL}/message`;

  try {
    const res = await fetch(checkUrl, {
      method: 'GET',
      headers: { Authorization: `Basic ${getAuthHeader()}` },
      signal: AbortSignal.timeout(4500)
    });

    if (res.ok) {
      const data = await res.json().catch(() => []);
      const deviceName = isCloud && Array.isArray(data) && data[0]?.name ? data[0].name : 'Android Phone';
      return {
        online: true,
        url: SMS_GATEWAY_URL,
        mode: isCloud ? 'cloud' : 'local',
        device: deviceName
      };
    }

    return {
      online: false,
      url: SMS_GATEWAY_URL,
      error: `HTTP ${res.status}: Gateway responded with error`
    };
  } catch (err) {
    return { online: false, url: SMS_GATEWAY_URL, error: err.message };
  }
}
