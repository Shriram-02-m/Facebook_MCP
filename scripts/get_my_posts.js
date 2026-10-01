require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const token = store.consumer_user_access_token;
const FIELDS = 'id,message,story,created_time,updated_time,permalink_url,full_picture';
const OUT = path.join(__dirname, '..', 'my_posts.json');

async function getAllPosts() {
  let all = [];
  let url = 'https://graph.facebook.com/v26.0/me/posts';
  let params = { access_token: token, limit: 25, fields: FIELDS };
  while (url) {
    const res = url === 'https://graph.facebook.com/v26.0/me/posts'
      ? await axios.get(url, { params })
      : await axios.get(url);
    all = all.concat(res.data.data || []);
    url = res.data.paging && res.data.paging.next;
  }
  return all;
}

getAllPosts().then(posts => {
  fs.writeFileSync(OUT, JSON.stringify(posts, null, 2));
  console.log('TOTAL POSTS:', posts.length);
  console.log('='.repeat(70));
  posts.forEach((p, i) => {
    const dt = new Date(p.created_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const txt = (p.message || p.story || (p.full_picture ? '[photo post - no text]' : '[no text]'))
      .replace(/\r?\n/g, ' ');
    console.log('[' + (i + 1) + '] ' + dt);
    console.log('     ' + (txt.length > 90 ? txt.substring(0, 90) + '...' : txt));
    if (p.permalink_url) console.log('     ' + p.permalink_url);
    console.log('-'.repeat(70));
  });
  console.log('Full data saved to: ' + OUT);
}).catch(e => {
  console.error('ERROR:', JSON.stringify(e.response?.data || e.message, null, 2));
});
