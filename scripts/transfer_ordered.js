const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const PAGE_ID = '1326722813860832';
const PAGE_TOKEN = store.page_access_tokens[PAGE_ID];
if (!PAGE_TOKEN) throw new Error('No page token for ' + PAGE_ID);

// oldest -> newest; caption carried over from the original post
const ROOT = require('path').join(__dirname, '..');
const POSTS = [
  { file: ROOT + '/my_post_images/post_08_2019-05-13.jpg', date: '13 May 2019', caption: null },
  { file: ROOT + '/my_post_images/post_06_2020-03-31.jpg', date: '31 Mar 2020', caption: null },
  { file: ROOT + '/my_post_images/post_02_2021-08-10.jpg', date: '10 Aug 2021', caption: 'How it\'s ending?' },
  { file: ROOT + '/my_post_images/post_01_2022-03-04.jpg', date: '4 Mar 2022', caption: null },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const results = [];
  for (let i = 0; i < POSTS.length; i++) {
    const p = POSTS[i];
    if (!fs.existsSync(p.file)) {
      console.log('[' + (i + 1) + '] MISSING FILE: ' + p.file);
      results.push({ date: p.date, status: 'missing file' });
      continue;
    }
    const form = new FormData();
    form.append('source', fs.createReadStream(p.file));
    if (p.caption) form.append('caption', p.caption);
    try {
      const r = await axios.post(
        'https://graph.facebook.com/v26.0/' + PAGE_ID + '/photos',
        form,
        { headers: form.getHeaders(), params: { access_token: PAGE_TOKEN }, maxBodyLength: Infinity, maxContentLength: Infinity }
      );
      console.log('[' + (i + 1) + '/' + POSTS.length + '] ' + p.date + ' -> PUBLISHED story=' + r.data.post_id);
      results.push({ date: p.date, post_id: r.data.post_id, status: 'ok' });
    } catch (e) {
      console.log('[' + (i + 1) + '] ' + p.date + ' -> FAILED: ' + (e.response?.data?.error?.message || e.message));
      results.push({ date: p.date, status: 'fail', error: e.response?.data?.error?.message || e.message });
    }
    await sleep(1800);
  }
  fs.writeFileSync(require('path').join(__dirname, '..', 'transfer_results_ordered.json'), JSON.stringify(results, null, 2));
  console.log('\nDone. Results saved to transfer_results_ordered.json');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
