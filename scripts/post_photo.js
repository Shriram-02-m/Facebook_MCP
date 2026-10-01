const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));

const pageToken = store.page_access_tokens['1326722813860832'];
const pageId = '1326722813860832';
const caption = '\uD83C\uDF0C Lord Vishnu resting on the cosmic serpent Shesha, amidst the stars of the universe. \u2728 #Vishnu #HinduMythology #CosmicArt';
const imagePath = 'C:/Users/shrir/Downloads/god vishnu.png';

console.log('Uploading image:', imagePath);
console.log('Caption:', caption);

const form = new FormData();
form.append('source', fs.createReadStream(imagePath));
form.append('caption', caption);
form.append('access_token', pageToken);

axios.post('https://graph.facebook.com/v26.0/' + pageId + '/photos', form, {
  headers: form.getHeaders(),
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
}).then(r => {
  console.log('\nSUCCESS!');
  console.log('Post ID :', r.data.id);
  console.log('Photo ID:', r.data.post_id || r.data.id);
  console.log('Full response:', JSON.stringify(r.data, null, 2));
}).catch(e => {
  console.error('\nERROR:', JSON.stringify(e.response?.data || e.message, null, 2));
});
