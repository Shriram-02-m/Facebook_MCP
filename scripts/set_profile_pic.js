const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));

const pageToken = store.page_access_tokens['1326722813860832'];
const pageId = '1326722813860832';
const imagePath = 'C:/Users/shrir/Downloads/shriram.jpeg';

async function main() {
  // 1. Upload photo as unpublished (no feed story created)
  const form = new FormData();
  form.append('source', fs.createReadStream(imagePath));
  form.append('published', 'false');
  const up = await axios.post(`https://graph.facebook.com/v26.0/${pageId}/photos`, form, {
    headers: form.getHeaders(),
    params: { access_token: pageToken },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const photoId = up.data.id;
  console.log('Uploaded unpublished photo:', photoId);

  // 2. Set as profile picture using the photo ID (per Graph API docs:
  //    POST /{page-id}/picture accepts "photo" (photo id) or "picture" (url),
  //    plus suppress_stories to avoid a feed story)
  const set = await axios.post(`https://graph.facebook.com/v26.0/${pageId}/picture`, null, {
    params: { access_token: pageToken, photo: photoId, suppress_stories: true },
  });
  console.log('Set profile picture:', JSON.stringify(set.data));

  // 3. Verify
  const verify = await axios.get(`https://graph.facebook.com/v26.0/${pageId}/picture`, {
    params: { access_token: pageToken, redirect: false, type: 'normal' },
  });
  console.log('Current profile picture URL:', verify.data.data?.url);
  console.log('DONE');
}

main().catch(e => {
  console.error('ERROR:', JSON.stringify(e.response?.data || e.message, null, 2));
  process.exit(1);
});
