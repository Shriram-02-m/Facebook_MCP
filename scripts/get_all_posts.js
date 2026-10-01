const fs = require('fs');
const axios = require('axios');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));

const pageToken = store.page_access_tokens['1326722813860832'];
const pageId = '1326722813860832';

async function getAllPosts() {
  let allPosts = [];
  let url = `https://graph.facebook.com/v26.0/${pageId}/posts`;
  let params = {
    access_token: pageToken,
    limit: 100,
    fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)',
  };

  while (url) {
    const res = await axios.get(url, { params });
    const data = res.data.data || [];
    allPosts = allPosts.concat(data);
    url = res.data.paging?.next || null;
    params = {}; // next URL already has all params baked in
  }
  return allPosts;
}

getAllPosts().then(posts => {
  console.log(`\nTotal posts found: ${posts.length}\n`);
  console.log('='.repeat(60));
  posts.forEach((post, i) => {
    const date = new Date(post.created_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`\n[${i + 1}] Post ID: ${post.id}`);
    console.log(`    Date   : ${date}`);
    if (post.message) console.log(`    Message: ${post.message.substring(0, 120)}${post.message.length > 120 ? '...' : ''}`);
    if (post.story)   console.log(`    Story  : ${post.story}`);
    console.log(`    Likes  : ${post.likes?.summary?.total_count ?? 0}`);
    console.log(`    Comments: ${post.comments?.summary?.total_count ?? 0}`);
    if (post.permalink_url) console.log(`    URL    : ${post.permalink_url}`);
    console.log('-'.repeat(60));
  });
}).catch(e => {
  console.error('ERROR:', JSON.stringify(e.response?.data || e.message, null, 2));
});
