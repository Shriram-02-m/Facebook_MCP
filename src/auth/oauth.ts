import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { saveUserAccessToken } from '../token-store/store';

dotenv.config();

function getPort(): number {
  return parseInt(process.env.PORT || '3000', 10);
}

function getAppId(): string {
  const appId = process.env.APP_ID;
  if (!appId || appId === 'your_facebook_app_id_here') {
    throw new Error('APP_ID is not properly configured in environment variables (.env).');
  }
  return appId;
}

function getAppSecret(): string {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret || appSecret === 'your_facebook_app_secret_here') {
    throw new Error('APP_SECRET is not properly configured in environment variables (.env).');
  }
  return appSecret;
}

function getRedirectUri(): string {
  return `http://localhost:${getPort()}/callback`;
}

function getConfigId(): string | null {
  const configId = process.env.CONFIG_ID;
  if (!configId || configId === 'your_configuration_id_here') {
    return null;
  }
  return configId;
}

const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_read_user_engagement',
  'read_insights',
].join(',');

let app: express.Express | null = null;
let server: any = null;

export function getAuthUrl(): string {
  const appId = getAppId();
  const redirectUri = getRedirectUri();
  const base = `https://www.facebook.com/v26.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const configId = getConfigId();
  if (configId) {
    return `${base}&config_id=${encodeURIComponent(configId)}&response_type=code&override_default_response_type=true`;
  }

  return `${base}&scope=${encodeURIComponent(SCOPES)}&response_type=code`;
}

export async function startOAuthServer(): Promise<void> {
  if (app) {
    logger.info('OAuth server is already running.');
    return;
  }

  const expressApp = express();
  app = expressApp;

  expressApp.get('/callback', async (req, res) => {
    logger.info(`Received OAuth callback query: ${JSON.stringify(req.query)}`);

    const code = req.query.code as string;
    const error = req.query.error as string;
    const errorReason = req.query.error_reason as string;
    const errorDescription = req.query.error_description as string;

    if (error || errorDescription) {
      logger.error(`Facebook OAuth error: ${error} - ${errorDescription || errorReason}`);
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">Facebook Authorization Failed</h2>
            <p><strong>Error:</strong> ${error || 'Unknown Error'}</p>
            <p><strong>Description:</strong> ${errorDescription || errorReason || 'No description provided.'}</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code) {
      logger.error('Authorization code missing in callback request.');
      let authUrl: string | null = null;
      try {
        authUrl = getAuthUrl();
      } catch {
        authUrl = null;
      }
      res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">No authorization code received</h2>
            <p>Facebook did not send a <code>code</code> parameter. This endpoint is the
               redirect target of the OAuth flow, so it only works when Facebook sends you here.</p>
            ${authUrl
              ? `<p><a href="${authUrl}" style="display: inline-block; background: #1877f2; color: #fff;
                   padding: 0.7rem 1.4rem; border-radius: 6px; text-decoration: none; font-weight: 600;">
                   Authorize with Facebook</a></p>
                 <p style="color: #666; font-size: 0.9rem;">Click the button, then approve the permissions
                   in the Facebook dialog. You will be redirected back here automatically.</p>`
              : `<p style="color: #d9534f;">Could not build the authorization URL. Check that
                   <code>APP_ID</code> is set in <code>.env</code>.</p>`}
          </body>
        </html>
      `);
      return;
    }

    try {
      const appId = getAppId();
      const appSecret = getAppSecret();
      const redirectUri = getRedirectUri();

      logger.info('Exchanging code for user access token...');
      const tokenResponse = await axios.get('https://graph.facebook.com/v26.0/oauth/access_token', {
        params: {
          client_id: appId,
          redirect_uri: redirectUri,
          client_secret: appSecret,
          code,
        },
      });

      const { access_token } = tokenResponse.data;
      
      await saveUserAccessToken(access_token);
      
      res.send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
            <h2 style="color: #2b78e4;">Authentication Successful! 🎉</h2>
            <p>Your access token has been securely saved to <code>.mcp_token_store.json</code>.</p>
            <p>You can close this window and return to your AI agent.</p>
          </body>
        </html>
      `);
      logger.info('Successfully obtained and saved user access token.');
      
    } catch (err: any) {
      const fbError = err.response?.data?.error?.message || err.message;
      logger.error('Error exchanging authorization code:', fbError);
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h2 style="color: #d9534f;">Token Exchange Failed</h2>
            <p><strong>Details:</strong> ${fbError}</p>
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
          `Permission denied binding port ${port}. Ports below 1024 need elevated privileges; ` +
          `choose a PORT above 1024 in .env.`
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
    // Allow a later call to retry instead of being blocked by a half-initialized server.
    app = null;
    server = null;
    throw err;
  });

  logger.info(`OAuth server listening at http://localhost:${port}`);
}

