require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Which app are we connecting? ────────────────────────────────────────────
// node oauth_connect.js              -> consumer (personal account)
// node oauth_connect.js business     -> business  (page management)
const FLOW = (process.argv[2] || 'consumer').toLowerCase() === 'business' ? 'business' : 'consumer';

const PORT = parseInt(process.env.PORT || '3000', 10);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STORE_PATH = path.join(__dirname, '..', '.mcp_token_store.json');

const APP_ID = FLOW === 'consumer' ? process.env.CONSUMER_APP_ID : process.env.BUSINESS_APP_ID;
const APP_SECRET = FLOW === 'consumer' ? process.env.CONSUMER_APP_SECRET : process.env.BUSINESS_APP_SECRET;
const CONFIG_ID = FLOW === 'business' ? process.env.BUSINESS_CONFIG_ID : undefined;

if (!APP_ID || APP_ID.includes('your_')) {
  console.error(`ERROR: ${FLOW === 'consumer' ? 'CONSUMER_APP_ID' : 'BUSINESS_APP_ID'} is not set in .env`);
  process.exit(1);
}
if (!APP_SECRET || APP_SECRET.includes('your_')) {
  console.error(`ERROR: ${FLOW === 'consumer' ? 'CONSUMER_APP_SECRET' : 'BUSINESS_APP_SECRET'} is not set in .env`);
  process.exit(1);
}

const USER_SCOPES = [
  'public_profile',
  'user_posts', 'user_photos', 'user_videos', 'user_likes', 'user_friends',
  'user_age_range', 'user_birthday', 'user_gender', 'user_hometown', 'user_location', 'user_link',
];
const PAGE_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
  'pages_manage_engagement', 'pages_manage_metadata', 'read_insights',
];
const truthy = (v) => String(v || '').toLowerCase() === 'true';

let REQUESTED_SCOPES = [];
const STATE = crypto.randomBytes(16).toString('hex');
let authUrl = `https://www.facebook.com/v26.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${STATE}`;

if (FLOW === 'business' && CONFIG_ID && !CONFIG_ID.includes('your_')) {
  authUrl += `&config_id=${encodeURIComponent(CONFIG_ID)}&response_type=code&override_default_response_type=true`;
  REQUESTED_SCOPES = [...PAGE_SCOPES];
} else {
  const scopes = [...USER_SCOPES];
  if (truthy(process.env.INCLUDE_EMAIL)) scopes.push('email');
  if (truthy(process.env.CONNECT_PAGES)) scopes.push(...PAGE_SCOPES);
  if (FLOW === 'business') scopes.splice(0, scopes.length, ...PAGE_SCOPES);
  REQUESTED_SCOPES = scopes;
  authUrl += `&scope=${encodeURIComponent(scopes.join(','))}&response_type=code`;
}

const app = express();

app.get('/callback', async (req, res) => {
  const { code, error, error_description, error_reason, state } = req.query;

  if (error) {
    console.error('OAuth error:', error, '-', error_description || error_reason);
    return res.status(400).send(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#d9534f">Authorization Failed</h2>
        <p><strong>Error:</strong> ${error}</p>
        <p>${error_description || error_reason || ''}</p>
      </body></html>`
    );
  }

  // State check: only accept callbacks matching this run's authorization URL.
  if (!state || state !== STATE) {
    return res.status(400).send(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#d9534f">Invalid OAuth state</h2>
        <p>Missing or non-matching state parameter. Start the flow again
           with <code>node oauth_connect.js ${FLOW}</code> and use the printed URL.</p>
      </body></html>`
    );
  }

  if (!code) {
    return res.status(400).send(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#d9534f">No authorization code received</h2>
        <p><a href="${authUrl}">Click here to authorize with Facebook</a></p>
      </body></html>`
    );
  }

  try {
    console.log('Exchanging code for access token...');
    const tokenRes = await axios.get('https://graph.facebook.com/v26.0/oauth/access_token', {
      params: { client_id: APP_ID, redirect_uri: REDIRECT_URI, client_secret: APP_SECRET, code }
    });

    let accessToken = tokenRes.data.access_token;
    let expires = null;

    // One-time short-lived -> long-lived exchange (~60 days). No auto-refresh.
    try {
      const ex = await axios.get('https://graph.facebook.com/v26.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: accessToken,
        }
      });
      if (ex.data && ex.data.access_token) {
        accessToken = ex.data.access_token;
        if (ex.data.expires_in) expires = new Date(Date.now() + ex.data.expires_in * 1000).toISOString();
        console.log('Long-lived token obtained. Expires:', expires || 'unknown');
      }
    } catch (e) {
      console.warn('Long-lived exchange failed, keeping short-lived token:',
        e && e.response && e.response.data && e.response.data.error ? e.response.data.error.message : e && e.message);
    }

    // Migration + flow isolation: this flow's slot is written, the other
    // flow's tokens are preserved untouched, and page tokens are kept.
    let store = {};
    try { store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')); } catch {}
    if (store.user_access_token && !store.consumer_user_access_token) {
      store.consumer_user_access_token = store.user_access_token;
      store.consumer_token_meta = store.user_token_meta;
      delete store.user_access_token;
      delete store.user_token_meta;
    }

    const meta = { obtained_at: new Date().toISOString(), expires_at: expires, scopes: REQUESTED_SCOPES };
    if (FLOW === 'consumer') {
      store.consumer_user_access_token = accessToken;
      store.consumer_token_meta = meta;
    } else {
      store.business_user_access_token = accessToken;
      store.business_token_meta = meta;
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

    console.log('');
    console.log(`SUCCESS! ${FLOW} token saved to .mcp_token_store.json`);
    console.log('You can close the browser and stop this server (Ctrl+C).');

    res.send(
      `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
        <h2 style="color:#2b78e4">${FLOW} Authentication Successful!</h2>
        <p>The <strong>${FLOW}</strong> user token is saved in its own slot — the other app's tokens were untouched.</p>
        ${FLOW === 'business' ? '<p>Now run <code>facebook_get_pages</code> to refresh your Page access tokens.</p>' : ''}
        <p>You can close this window and return to your AI agent.</p>
      </body></html>`
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('Token exchange failed:', msg);
    res.status(500).send(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#d9534f">Token Exchange Failed</h2>
        <p>${msg}</p>
      </body></html>`
    );
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('=================================================');
  console.log(`  Facebook [${FLOW}] OAuth Server on http://localhost:${PORT}`);
  console.log('=================================================');
  console.log('');
  console.log('  Open this URL in your browser to authorize:');
  console.log('');
  console.log(`  ${authUrl}`);
  console.log('');
  console.log('  Waiting for callback... Press Ctrl+C to cancel.');
  console.log('=================================================');
});
