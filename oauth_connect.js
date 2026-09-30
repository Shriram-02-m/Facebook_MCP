require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const CONFIG_ID = process.env.CONFIG_ID;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STORE_PATH = path.join(__dirname, '.mcp_token_store.json');

if (!APP_ID || APP_ID === 'your_facebook_app_id_here') {
  console.error('ERROR: APP_ID is not set in .env');
  process.exit(1);
}

// Build auth URL
let authUrl = `https://www.facebook.com/v26.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
if (CONFIG_ID && CONFIG_ID !== 'your_configuration_id_here') {
  authUrl += `&config_id=${encodeURIComponent(CONFIG_ID)}&response_type=code&override_default_response_type=true`;
} else {
  const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_read_user_engagement,read_insights';
  authUrl += `&scope=${encodeURIComponent(scopes)}&response_type=code`;
}

const app = express();

app.get('/callback', async (req, res) => {
  const { code, error, error_description, error_reason } = req.query;

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

    const { access_token } = tokenRes.data;

    // Save to token store
    let store = {};
    try { store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')); } catch {}
    store.user_access_token = access_token;
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

    console.log('');
    console.log('SUCCESS! Token saved to .mcp_token_store.json');
    console.log('You can close the browser and stop this server (Ctrl+C).');

    res.send(
      `<html><body style="font-family:sans-serif;padding:2rem;text-align:center">
        <h2 style="color:#2b78e4">Authentication Successful!</h2>
        <p>Your access token has been saved to <code>.mcp_token_store.json</code>.</p>
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
  console.log(`  Facebook OAuth Server on http://localhost:${PORT}`);
  console.log('=================================================');
  console.log('');
  console.log('  Open this URL in your browser to authorize:');
  console.log('');
  console.log(`  ${authUrl}`);
  console.log('');
  console.log('  Waiting for callback... Press Ctrl+C to cancel.');
  console.log('=================================================');
});
