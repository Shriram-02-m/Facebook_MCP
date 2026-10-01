const axios = require('axios');
const fs = require('fs');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const PAGE_ID = '1326722813860832';
const token = store.page_access_tokens[PAGE_ID];
const TEXT = 'Nice work';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const all = [];
  let url = 'https://graph.facebook.com/v26.0/' + PAGE_ID + '/posts';
  let params = { access_token: token, limit: 50, fields: 'id,message,created_time' };
  let first = true;
  while (url) {
    const res = first ? await axios.get(url, { params }) : await axios.get(url);
    first = false;
    all.push(...(res.data.data || []));
    url = res.data.paging && res.data.paging.next;
  }
  console.log('Posts: ' + all.length);

  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    try {
      const existing = await axios.get('https://graph.facebook.com/v26.0/' + p.id + '/comments', {
        params: { access_token: token, limit: 50, fields: 'message,from' },
      });
      const mine = (existing.data.data || []).filter(c => c.from && c.from.id === PAGE_ID && c.message === TEXT);
      if (mine.length) {
        console.log('[' + (i + 1) + '/' + all.length + '] already commented, skipping');
        continue;
      }
    } catch (e) { /* ignore, attempt post anyway */ }

    try {
      const r = await axios.post('https://graph.facebook.com/v26.0/' + p.id + '/comments',
        { message: TEXT }, { params: { access_token: token } });
      console.log('[' + (i + 1) + '/' + all.length + '] ' + p.created_time.slice(0, 10) +
        ' -> COMMENTED id=' + r.data.id);
    } catch (e) {
      console.log('[' + (i + 1) + '/' + all.length + '] ' + p.created_time.slice(0, 10) +
        ' -> FAIL: ' + (e.response?.data?.error?.message || e.message));
    }
    await sleep(1500);
  }

  const check = await axios.get('https://graph.facebook.com/v26.0/' + PAGE_ID + '/posts', {
    params: { access_token: token, limit: 50, fields: 'id,comments.summary(true).limit(0)' },
  });
  console.log('\nVerification:');
  check.data.data.forEach((p, i) => {
    const c = p.comments && p.comments.summary;
    console.log('  ' + (i + 1) + '. comments=' + (c ? c.total_count : '?') + ' (' + p.id.split('_')[1] + ')');
  });
})().catch(e => console.error('FATAL:', e.response?.data?.error?.message || e.message));
