import { google } from 'googleapis';

/**
 * Gmail Service for Mail-E
 * Handles Google OAuth2 authentication and message retrieval.
 */

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth 2.0 authorization URL
 */
export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
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
export async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
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
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
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
 * Check recent emails from Gmail inbox using OAuth tokens
 */
export async function fetchRecentEmails(tokens, maxResults = 15) {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client || !tokens) {
    throw new Error('Gmail OAuth is not connected');
  }

  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // List recent messages - search recent inbox messages
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox'
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
