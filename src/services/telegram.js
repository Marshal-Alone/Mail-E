/**
 * Telegram Notification Service for Mail-E
 * Formats rich actionable placement alerts and dispatches them via Telegram Bot API using fetch().
 */

/**
 * Format a structured AI analysis into the official Mail-E Telegram alert format
 */
export function formatTelegramAlert(analysis) {
  const {
    company = 'Company Notice',
    role = 'Opportunity',
    package: ctc = 'As announced',
    assessmentDate,
    interviewDate,
    applicationDeadline,
    eligibility = [],
    location = 'Pan-India',
    applicationLink,
    assessmentLink,
    action
  } = analysis;

  let message = `🚨 *MAIL-E PLACEMENT ALERT*\n\n`;
  message += `🏢 *Company:* ${company}\n`;
  message += `💼 *Role:* ${role}\n`;
  message += `💰 *Package / CTC:* ${ctc}\n\n`;

  if (assessmentDate) {
    message += `📅 *Assessment:* ${assessmentDate}\n`;
  }
  if (interviewDate) {
    message += `🎙️ *Interview:* ${interviewDate}\n`;
  }
  if (applicationDeadline) {
    message += `⏰ *Deadline:* ${applicationDeadline}\n\n`;
  } else {
    message += `\n`;
  }

  if (eligibility && eligibility.length > 0) {
    message += `🎓 *Eligibility:*\n`;
    eligibility.forEach(item => {
      message += ` • ${item}\n`;
    });
    message += `\n`;
  }

  if (location) {
    message += `📍 *Location:* ${location}\n\n`;
  }

  if (applicationLink) {
    message += `🔗 *Apply Link:*\n${applicationLink}\n\n`;
  } else if (assessmentLink) {
    message += `🔗 *Assessment Link:*\n${assessmentLink}\n\n`;
  }

  if (action) {
    message += `⚠️ *ACTION REQUIRED:*\n${action}`;
  }

  return message.trim();
}

/**
 * Send alert to student's Telegram chat
 *
 * @param {string} chatId - Student's Telegram chat ID
 * @param {string} messageText - Alert text content
 * @returns {Promise<{ success: boolean, status: string, deliveryId?: string, error?: string }>}
 */
export async function sendTelegramAlert(chatId, messageText) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (token && token.trim() !== '' && chatId) {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        })
      });

      const data = await response.json();
      if (data.ok) {
        return {
          success: true,
          status: 'sent',
          deliveryId: String(data.result.message_id)
        };
      } else {
        console.warn('[Telegram] API error:', data.description);
        return {
          success: false,
          status: 'failed',
          error: data.description
        };
      }
    } catch (err) {
      console.warn('[Telegram] Network request failed:', err.message);
      return {
        success: false,
        status: 'failed',
        error: err.message
      };
    }
  }

  // Simulation fallback: allows pipeline testing without live credentials
  return {
    success: true,
    status: 'simulated',
    deliveryId: `SIM-TG-${Date.now().toString().slice(-6)}`
  };
}
