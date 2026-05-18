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

