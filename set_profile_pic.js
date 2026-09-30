const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const store = require('./.mcp_token_store.json');

const pageToken = store.page_access_tokens['1326722813860832'];
const pageId = '1326722813860832';
const imagePath = 'C:/Users/shrir/Downloads/shriram.jpeg';

async function uploadPhoto(published) {
  const form = new FormData();
  form.append('source', fs.createReadStream(imagePath));
  form.append('published', published ? 'true' : 'false');
  const res = await axios.post(`https://graph.facebook.com/v26.0/${pageId}/photos`, form, {
    headers: form.getHeaders(),
    params: { access_token: pageToken },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  console.log(`Uploaded photo (published=${published}):`, JSON.stringify(res.data));
  return res.data.id;
}

async function getSourceUrl(photoId) {
  const res = await axios.get(`https://graph.facebook.com/v26.0/${photoId}`, {
    params: { access_token: pageToken, fields: 'id,source' },
  });
  console.log('Photo source URL obtained');
  return res.data.source;
}

async function setProfilePicture(url) {
  const res = await axios.post(`https://graph.facebook.com/v26.0/${pageId}/picture`, null, {
    params: { access_token: pageToken, url },
  });
  console.log('Set profile picture result:', JSON.stringify(res.data));
  return res.data;
}

async function verify() {
  const res = await axios.get(`https://graph.facebook.com/v26.0/${pageId}/picture`, {
    params: { access_token: pageToken, redirect: false, type: 'normal' },
  });
  console.log('Current profile picture URL:', res.data.data?.url);
}

async function main() {
  // Attempt 1: unpublished photo (no feed story created)
  try {
    const photoId = await uploadPhoto(false);
    const sourceUrl = await getSourceUrl(photoId);
    await setProfilePicture(sourceUrl);
  } catch (e) {
    console.error('Unpublished attempt failed:', JSON.stringify(e.response?.data || e.message, null, 2));
    console.log('\nRetrying with published photo...');
    const photoId = await uploadPhoto(true);
    const sourceUrl = await getSourceUrl(photoId);
    await setProfilePicture(sourceUrl);
  }

  console.log('\nVerifying...');
  await verify();
  console.log('\nDONE - profile picture updated.');
}

main().catch(e => {
  console.error('FATAL:', JSON.stringify(e.response?.data || e.message, null, 2));
  process.exit(1);
});
