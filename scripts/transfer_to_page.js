const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const PAGE_ID = '1326722813860832';
const PAGE_TOKEN = store.page_access_tokens[PAGE_ID];
if (!PAGE_TOKEN) {
  throw new Error('No Page token found for ' + PAGE_ID + ' in token store');
}

const manifest = JSON.parse(fs.readFileSync('transfer_manifest.json', 'utf-8'));
const realPosts = manifest.filter(p => p.attachment_type === 'photo');

const OUT_DIR = path.join(__dirname, '..', 'page_transfer');
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function publish(post, index) {
  const tmp = path.join(OUT_DIR, 'image_' + index + '.jpg');
  const img = await axios.get(post.image_src, { responseType: 'arraybuffer', maxContentLength: Infinity });
  fs.writeFileSync(tmp, Buffer.from(img.data));

  const form = new FormData();
  form.append('source', fs.createReadStream(tmp));
  if (post.caption) form.append('caption', post.caption);

  const res = await axios.post(
    'https://graph.facebook.com/v26.0/' + PAGE_ID + '/photos',
    form,
    { headers: form.getHeaders(), params: { access_token: PAGE_TOKEN }, maxBodyLength: Infinity }
  );

  return { source: post.source_post_id, photo_id: res.data.id, page_post_id: res.data.post_id, caption: post.caption };
}

(async () => {
  console.log('Publishing ' + realPosts.length + ' posts to page ' + PAGE_ID);
  const results = [];
  for (let i = 0; i < realPosts.length; i++) {
    const p = realPosts[i];
    console.log('Publishing [' + (i + 1) + '/' + realPosts.length + '] ' + p.date.slice(0, 10) + ' ...');
    try {
      const r = await publish(p, i);
      console.log('  OK  photo=' + r.photo_id + ' story=' + r.page_post_id);
      results.push({ ...r, status: 'ok' });
    } catch (e) {
      console.log('  FAIL  ' + JSON.stringify(e.response?.data?.error?.message || e.message));
      results.push({ source: p.source_post_id, date: p.date, status: 'fail', error: e.response?.data?.error?.message || e.message });
    }
    await sleep(2000);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved results.json in ' + OUT_DIR);
})();
