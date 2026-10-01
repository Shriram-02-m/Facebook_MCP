import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { saveUserAccessToken } from '../token-store/store';
import { OAuthFlow } from '../types';

dotenv.config();

const API = 'https://graph.facebook.com/v26.0';

function getPort(): number {
  return parseInt(process.env.PORT || '3000', 10);
}

// ── App credentials, strictly separated per flow ────────────────────────────

interface AppCreds {
  appId: string;
  appSecret: string;
  configId?: string;
}

export function getConsumerCreds(): AppCreds {
  const appId = process.env.CONSUMER_APP_ID;
  const appSecret = process.env.CONSUMER_APP_SECRET;
  if (!appId || appId === 'your_consumer_app_id_here') {
    throw new Error('CONSUMER_APP_ID is not configured in .env.');
  }
  if (!appSecret || appSecret === 'your_consumer_app_secret_here') {
    throw new Error('CONSUMER_APP_SECRET is not configured in .env.');
  }
  return { appId, appSecret };
}

export function getBusinessCreds(): AppCreds {
  const appId = process.env.BUSINESS_APP_ID;
  const appSecret = process.env.BUSINESS_APP_SECRET;
  const configId = process.env.BUSINESS_CONFIG_ID;
  if (!appId || appId === 'your_business_app_id_here') {
    throw new Error('BUSINESS_APP_ID is not configured in .env.');
  }
  if (!appSecret || appSecret === 'your_business_app_secret_here') {
    throw new Error('BUSINESS_APP_SECRET is not configured in .env.');
  }
  const validConfig =
    configId && configId !== 'your_configuration_id_here' ? configId : undefined;
  return { appId, appSecret, configId: validConfig };
}

function getRedirectUri(): string {
  return `http://localhost:${getPort()}/callback`;
}

// ── Scopes ───────────────────────────────────────────────────────────────────

// Personal-account (Facebook Login) read scopes. This Consumer app only
// accepts these in the consent dialog (verified live). email/pages_* are
// optional opt-ins because Meta rejected them for this app type.
export const USER_SCOPES = [
  'public_profile',
  'user_posts',
  'user_photos',
  'user_videos',
  'user_likes',
  'user_friends',
  'user_age_range',
  'user_birthday',
  'user_gender',
  'user_hometown',
  'user_location',
  'user_link',
];

// Page-management scopes requested for the Business flow.
// (pages_read_user_engagement intentionally omitted: Meta rejected it as an
// invalid scope during authorization — verified live.)
export const PAGE_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'read_insights',
];

export function buildRequestedScopes(flow: OAuthFlow): string[] {
  const truthy = (v?: string) => (v || '').toLowerCase() === 'true';
  if (flow === 'business') return [...PAGE_SCOPES];
  const scopes = [...USER_SCOPES];
  if (truthy(process.env.INCLUDE_EMAIL)) scopes.push('email');
  if (truthy(process.env.CONNECT_PAGES)) scopes.push(...PAGE_SCOPES);
  return scopes;
}

// ── State → flow router ──────────────────────────────────────────────────────
// Both flows share http://localhost:PORT/callback. To know which app a
// callback belongs to, every authorization URL embeds a random `state`; the
// server remembers which flow generated it. The callback is only accepted if
// the state matches (also mitigates CSRF / app mix-up).
const pendingStates = new Map<string, OAuthFlow>();

export function getAuthUrl(flow: OAuthFlow): string {
  const creds = flow === 'consumer' ? getConsumerCreds() : getBusinessCreds();
  const redirectUri = getRedirectUri();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, flow);

  const base =
    'https://www.facebook.com/v26.0/dialog/oauth' +
    `?client_id=${creds.appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  if (flow === 'business' && creds.configId) {
    // Login for Business: permissions come from the config, not a scope list.
    return `${base}&config_id=${encodeURIComponent(creds.configId)}&state=${state}&response_type=code&override_default_response_type=true`;
  }

  const scopes = buildRequestedScopes(flow);
  return `${base}&scope=${encodeURIComponent(scopes.join(','))}&state=${state}&response_type=code`;
}

// ── Callback server (shared by both flows) ───────────────────────────────────

let app: express.Express | null = null;
let server: any = null;

// Escape every value that Facebook echoes back through the redirect query
// (error, error_description, ...). A tampered redirect must not be able to
// inject markup into our local response page.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};
function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch] || ch);
}

export async function startOAuthServer(): Promise<void> {
  if (app) {
    logger.info('OAuth server is already running.');
    return;
  }

  const expressApp = express();
  app = expressApp;

  expressApp.get('/callback', async (req, res) => {
    // Never log req.query wholesale: it contains the authorization code.
    const flow: OAuthFlow | undefined = req.query.state
      ? pendingStates.get(req.query.state as string)
      : undefined;

    const error = req.query.error as string;
    const errorReason = req.query.error_reason as string;
    const errorDescription = req.query.error_description as string;

    if (error || errorDescription) {
      logger.error(`Facebook OAuth error (flow=${flow || 'unknown'}): ${error} - ${errorDescription || errorReason}`);
      if (req.query.state) pendingStates.delete(req.query.state as string);
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">Facebook Authorization Failed</h2>
            <p><strong>Error:</strong> ${escapeHtml(error) || 'Unknown Error'}</p>
            <p><strong>Description:</strong> ${escapeHtml(errorDescription || errorReason) || 'No description provided.'}</p>
          </body>
        </html>
      `);
      return;
    }

    // Reliable routing: a callback without a known state cannot be assigned
    // to either app, and is rejected — we never guess.
    if (!flow) {
      logger.warn('OAuth callback had missing or unknown state — rejected.');
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">Invalid or expired OAuth state</h2>
            <p>The callback could not be matched to a pending authorization
               (missing <code>state</code>, or it was already used). Re-run
               <code>facebook_connect</code> with a flow and use the freshly
               generated URL.</p>
          </body>
        </html>
      `);
      return;
    }

    // One-time use
    pendingStates.delete(req.query.state as string);

    const code = req.query.code as string;
    if (!code) {
      logger.error('Authorization code missing in callback request.');
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">No authorization code received</h2>
            <p>Facebook did not send a <code>code</code> parameter for the
               <strong>${flow}</strong> ${flow === 'business' ? 'page-management' : 'personal-account'} flow.</p>
          </body>
        </html>
      `);
      return;
    }

    try {
      const creds = flow === 'consumer' ? getConsumerCreds() : getBusinessCreds();
      const redirectUri = getRedirectUri();

      logger.info(`Exchanging code for ${flow} user access token...`);
      // Body (not query string) so the App Secret never appears in a URL.
      const tokenResponse = await axios.post(`${API}/oauth/access_token`, new URLSearchParams({
        client_id: creds.appId,
        client_secret: creds.appSecret,
        code,
        redirect_uri: redirectUri,
      }));

      let accessToken = tokenResponse.data.access_token;
      let expiresAt: string | undefined;

      // Short-lived (~1-2h) -> long-lived (~60 days) via fb_exchange_token.
      // This is a one-time exchange per login, not an auto-refresh system:
      // after the long-lived token expires you must re-run facebook_connect.
      try {
        const exchange = await axios.post(`${API}/oauth/access_token`, new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: creds.appId,
          client_secret: creds.appSecret,
          fb_exchange_token: accessToken,
        }));
        if (exchange.data?.access_token) {
          accessToken = exchange.data.access_token;
          if (exchange.data.expires_in) {
            expiresAt = new Date(Date.now() + exchange.data.expires_in * 1000).toISOString();
          }
          logger.info(`Long-lived ${flow} token obtained (expires ${expiresAt || 'unknown'}).`);
        }
      } catch (exchangeErr: any) {
        logger.warn(`Long-lived exchange failed for ${flow} flow; keeping short-lived token:`,
          exchangeErr.response?.data?.error?.message || exchangeErr.message);
      }

      // Slot by flow: consumer login never overwrites the business token and
      // vice versa; page_access_tokens are untouched here.
      await saveUserAccessToken(flow, accessToken, {
        obtained_at: new Date().toISOString(),
        expires_at: expiresAt,
        // For a config_id login, Meta decides scopes server-side; we still
        // record what we requested so operators see the intent.
        scopes: buildRequestedScopes(flow),
      });

      res.send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
            <h2 style="color: #2b78e4;">${flow === 'consumer' ? 'Personal account' : 'Business / Page'} Authentication Successful!</h2>
            <p>The <strong>${flow}</strong> user token was saved to <code>.mcp_token_store.json</code> (separate slot — the other app's tokens were not touched).</p>
            ${flow === 'business' ? '<p>Next run <code>facebook_get_pages</code> to refresh Page access tokens.</p>' : ''}
            <p>You can close this window and return to your AI agent.</p>
          </body>
        </html>
      `);
      logger.info(`Successfully obtained and saved ${flow} user access token.`);

    } catch (err: any) {
      const fbError = err.response?.data?.error?.message || err.message;
      logger.error(`Error exchanging authorization code (${flow}):`, fbError);
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">Token Exchange Failed</h2>
            <p><strong>Details:</strong> ${escapeHtml(fbError)}</p>
          </body>
        </html>
      `);
    }
  });

  const port = getPort();
  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use, so the OAuth callback server cannot start. ` +
          `Close whatever is using it (or set a different PORT in .env), then call facebook_connect again. ` +
          `To see what is holding the port on Windows: netstat -ano | findstr :${port}`
        ));
      } else if (err.code === 'EACCES') {
        reject(new Error(
          `Permission denied binding port ${port}. Choose a PORT above 1024 in .env.`
        ));
      } else {
        reject(err);
      }
    };

    const httpServer = expressApp.listen(port, () => {
      httpServer.off('error', onError);
      resolve();
    });
    server = httpServer;
    httpServer.once('error', onError);
  }).catch((err) => {
    app = null;
    server = null;
    throw err;
  });

  logger.info(`OAuth server listening at http://localhost:${port} (flows: consumer + business)`);
}

// Close the local callback server (freed PORT). Pending states are cleared;
// startOAuthServer() can be called again afterwards.
export async function stopOAuthServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
    server = null;
  }
  app = null;
  pendingStates.clear();
  logger.info('OAuth server stopped.');
}
