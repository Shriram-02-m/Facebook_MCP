const fs = require('fs');
const axios = require('axios');
const s = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const t = s.page_access_tokens['1326722813860832'];
const PAGE = '1326722813860832';

(async () => {
  try {
    const r = await axios.get('https://graph.facebook.com/v26.0/' + PAGE, {
      params: { access_token: t, fields: 'id,name,cover' },
    });
    console.log('COVER:', JSON.stringify(r.data));
  } catch (e) {
    console.log('cover field err:', e.response && e.response.data && e.response.data.error && e.response.data.error.message);
  }

  const feed = await axios.get('https://graph.facebook.com/v26.0/' + PAGE + '/posts', {
    params: { access_token: t, limit: 10, fields: 'id,created_time,message,story,full_picture' },
  });
  feed.data.data.forEach(p => {
    console.log('feed:', p.created_time.slice(0, 10), '|', (p.message || p.story || '(none)').substring(0, 50), '| img:', p.full_picture ? 'yes' : 'no');
  });
})().catch(e => console.log('ERR', e.message));
