import { gmail as getGmailClient, auth } from 'googleapis/build/src/apis/gmail/index.js';

/**
 * Gmail Service for Mail-E
 * Handles Google OAuth2 authentication and message retrieval.
 */

export function getOAuth2Client(customRedirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return new auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth 2.0 authorization URL
 */
export function getAuthUrl(customRedirectUri) {
  const oauth2Client = getOAuth2Client(customRedirectUri);
  if (!oauth2Client) {
    return null;
  }

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code, customRedirectUri) {
  const oauth2Client = getOAuth2Client(customRedirectUri);
  if (!oauth2Client) {
    throw new Error('Google OAuth credentials are not configured in .env');
  }

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Get authorized user profile (email address)
 */
export async function getGmailProfile(tokens) {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client || !tokens) return null;
  oauth2Client.setCredentials(tokens);
  const gmail = getGmailClient({ version: 'v1', auth: oauth2Client });
  const profileRes = await gmail.users.getProfile({ userId: 'me' });
  return profileRes.data;
}

function extractBodyFromPayload(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        const nested = extractBodyFromPayload(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

/**
 * Fetch new emails from Gmail inbox using time-based incremental sync
 *
 * @param {Object} tokens - OAuth tokens
 * @param {Object|number} [options] - Sync options or legacy maxResults integer
 * @param {Date} [options.sinceDate] - Only fetch emails received after this timestamp
 * @param {number} [options.maxResults] - Maximum emails per sync cycle (default: 30)
 * @param {string} [options.query] - Custom Gmail search filter
 */
export async function fetchRecentEmails(tokens, options = {}) {
  const opts = typeof options === 'number' ? { maxResults: options } : options;
  const { sinceDate = null, maxResults = 30, query = null } = opts;

  const oauth2Client = getOAuth2Client();
  if (!oauth2Client || !tokens) {
    throw new Error('Gmail OAuth is not connected');
  }

  oauth2Client.setCredentials(tokens);
  const gmail = getGmailClient({ version: 'v1', auth: oauth2Client });

  // Time-based incremental query:
  // 1. If sinceDate exists: fetch messages received after that exact timestamp
  // 2. If new user: look back 2 days (newer_than:2d) to capture active drives without indexing historical spam
  let q = 'in:inbox';
  if (query) {
    q = query;
  } else if (sinceDate && sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
    const sinceSeconds = Math.floor(sinceDate.getTime() / 1000);
    q = `in:inbox after:${sinceSeconds}`;
  } else {
    q = 'in:inbox newer_than:2d';
  }

  // List recent messages matching query
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q
  });

  const messages = listRes.data.messages || [];
  const emails = [];

  for (const msgRef of messages) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgRef.id,
        format: 'full'
      });

      const msg = msgRes.data;
      const headers = msg.payload?.headers || [];

      const getHeader = (name) => {
        const found = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return found ? found.value : '';
      };

      const subject = getHeader('Subject') || '(No Subject)';
      const sender = getHeader('From') || '(Unknown Sender)';
      const dateStr = getHeader('Date');
      const receivedAt = dateStr ? new Date(dateStr) : new Date();

      // Extract body text
      const body = extractBodyFromPayload(msg.payload) || msg.snippet || '';

      emails.push({
        providerMessageId: msg.id,
        subject,
        sender,
        snippet: msg.snippet || '',
        bodyText: body,
        receivedAt
      });
    } catch (err) {
      console.warn(`Failed to fetch message details for ${msgRef.id}:`, err.message);
    }
  }

  return emails;
}
