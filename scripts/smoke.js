// Smoke test: starts the stdio MCP server, performs the JSON-RPC handshake,
// lists tools, and asserts the tool registry is complete and well-formed.
// Pure/offline checks (no network): URL builders never leak app secrets.
// Exit 0 = pass, nonzero = fail. Used by `npm run smoke`.
const { spawn } = require('child_process');
const path = require('path');

const EXPECTED = [
  'facebook_connect', 'facebook_get_pages', 'facebook_get_page', 'facebook_create_post',
  'facebook_get_posts', 'facebook_get_comments', 'facebook_create_comment',
  'facebook_reply_to_comment', 'facebook_get_insights', 'facebook_delete_post',
  'facebook_update_post', 'facebook_create_photo_post', 'facebook_like_post',
  'facebook_unlike_post', 'facebook_get_cover', 'facebook_set_cover_photo',
  'facebook_set_profile_picture', 'facebook_bulk_like', 'facebook_bulk_comment',
  'facebook_get_me', 'facebook_get_my_profile', 'facebook_get_my_posts',
  'facebook_get_my_photos', 'facebook_get_my_videos', 'facebook_get_my_likes',
  'facebook_get_my_friends', 'facebook_check_token', 'facebook_share_dialog_url',
];

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

// ── Offline: URL builders must not contain any secret ──────────────────────
const SECRET_C = 'smoke-consumer-secret-MUST-NOT-LEAK';
const SECRET_B = 'smoke-business-secret-MUST-NOT-LEAK';
process.env.CONSUMER_APP_ID = process.env.CONSUMER_APP_ID || '111';
process.env.CONSUMER_APP_SECRET = SECRET_C;
process.env.BUSINESS_APP_ID = process.env.BUSINESS_APP_ID || '222';
process.env.BUSINESS_APP_SECRET = SECRET_B;
process.env.BUSINESS_CONFIG_ID = '333';
require('dotenv').config();

const oauth = require(path.join(__dirname, '..', 'dist', 'auth', 'oauth.js'));
const client = require(path.join(__dirname, '..', 'dist', 'facebook-api', 'client.js'));

for (const flow of ['consumer', 'business']) {
  const u = oauth.getAuthUrl(flow);
  if (!/state=[0-9a-f]{32}/.test(u)) fail(`getAuthUrl(${flow}) has no state param`);
  const secret = flow === 'consumer' ? SECRET_C : SECRET_B;
  if (u.includes(secret)) fail(`getAuthUrl(${flow}) leaks the app secret`);
  if (/access_token=/.test(u)) fail(`authorization URL for ${flow} contains an access_token`);
}
const share = client.buildShareDialogUrl('https://example.com', 'hi');
if (share.includes(SECRET_C)) fail('buildShareDialogUrl leaks secrets');

// ── Online: stdio JSON-RPC handshake + tools/list ──────────────────────────
const child = spawn('node', [path.join(__dirname, '..', 'dist', 'server', 'index.js')], {
  env: { ...process.env, MCP_TRANSPORT: 'stdio' },
});

let stdout = '';
child.stdout.on('data', (d) => { stdout += d.toString(); });
child.stderr.on('data', () => { /* logger output, ignore */ });

function send(obj) {
  if (!child.stdin.writable) return;
  child.stdin.write(JSON.stringify(obj) + '\n');
}

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

const kill = () => { try { child.kill(); } catch {} };
const timer = setTimeout(() => { fail('timeout waiting for tools/list'); }, 20000);

(function poll() {
  try {
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.id === 2 && m.result && Array.isArray(m.result.tools)) {
        clearTimeout(timer);
        const names = m.result.tools.map(t => t.name);
        const missing = EXPECTED.filter(n => !names.includes(n));
        if (missing.length) fail('missing tools: ' + missing.join(', '));
        const extra = names.filter(n => !EXPECTED.includes(n));
        if (extra.length) fail('unexpected new tools (update smoke): ' + extra.join(', '));
        if (new Set(names).size !== names.length) fail('duplicate tool names in registry');
        for (const t of m.result.tools) {
          const s = JSON.stringify(t);
          if (/SECRET|access_token/.test(s) && t.name !== 'facebook_check_token' && !t.inputSchema) fail('tool leaks secret-ish text: ' + t.name);
        }
        const c = m.result.tools.find(t => t.name === 'facebook_connect');
        if (!c.inputSchema.properties.flow || !(c.inputSchema.required || []).includes('flow')) fail('connect flow schema wrong');
        console.log(`PASS: ${names.length} tools registered; URL builders leak no secrets.`);
        kill();
        process.exit(0);
      }
    }
  } catch (e) { clearTimeout(timer); fail('parse error: ' + e.message); }
  setTimeout(poll, 150);
})();
