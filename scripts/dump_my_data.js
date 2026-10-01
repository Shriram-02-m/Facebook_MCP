require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const token = store.consumer_user_access_token;
const BASE = 'https://graph.facebook.com/v26.0';

async function edge(path_, fields, limit = 50) {
  const all = [];
  let url = BASE + path_;
  let params = { access_token: token, limit, fields };
  let first = true;
  try {
    while (url) {
      const res = first ? await axios.get(url, { params }) : await axios.get(url);
      first = false;
      all.push(...(res.data.data || []));
      url = res.data.paging && res.data.paging.next;
      if (all.length > 1000) break;
    }
  } catch (e) {
    return { error: e.response?.data?.error?.message || e.message, partial: all };
  }
  return { data: all };
}

async function single(path_, fields) {
  try {
    const res = await axios.get(BASE + path_, { params: { access_token: token, fields } });
    return { data: res.data };
  } catch (e) {
    return { error: e.response?.data?.error?.message || e.message };
  }
}

(async () => {
  const out = {};

  out.profile = (await single('/me',
    'id,name,first_name,last_name,short_name,link,verified,age_range,birthday,gender,hometown,locale,timezone,updated_time')).data;

  try {
    const pic = await axios.get(BASE + '/me/picture', {
      params: { access_token: token, redirect: false, type: 'large' },
    });
    out.profile_picture = { data: pic.data.data };
  } catch (e) {
    out.profile_picture = { error: e.response?.data?.error?.message || e.message };
  }

  console.log('Fetching posts...');
  out.posts = await edge('/me/posts', 'id,message,story,created_time,updated_time,permalink_url,full_picture');

  console.log('Fetching comments for each post...');
  for (const post of (out.posts.data || [])) {
    post.comments = await edge('/' + post.id + '/comments',
      'id,message,created_time,like_count,from{id,name}', 50);
  }

  console.log('Fetching albums...');
  out.albums = await edge('/me/albums', 'id,name,description,count,created_time,updated_time,link');
  for (const album of (out.albums.data || [])) {
    album.photos = await edge('/' + album.id + '/photos',
      'id,name,created_time,link,picture,width,height', 100);
  }

  console.log('Fetching videos, likes, friends...');
  out.videos = await edge('/me/videos', 'id,title,description,created_time,length,permalink_url');
  out.liked_pages = await edge('/me/likes', 'id,name,category,created_time,fan_count');
  out.friends = await edge('/me/friends', 'id,name');
  out.tagged_photos = await edge('/me/photos', 'id,name,created_time,link', 50);
  out.pages = await edge('/me/accounts', 'id,name,category,tasks');
  out.pages.data = (out.pages.data || []).map(({ access_token, ...rest }) => rest);

  const file = path.join(__dirname, '..', 'my_facebook_data.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  const sum = (x) => x.error ? 'ERROR: ' + x.error : (x.data || []).length;
  const pc = (out.posts.data || []).reduce((n, p) => n + ((p.comments.data || []).length), 0);
  const ph = (out.albums.data || []).reduce((n, a) => n + ((a.photos.data || []).length), 0);
  console.log('\n================ SUMMARY ================');
  console.log('Profile          :', out.profile && out.profile.name);
  console.log('Posts            :', sum(out.posts));
  console.log('Comments on them :', pc);
  console.log('Albums           :', sum(out.albums));
  console.log('Photos in albums :', ph);
  console.log('Videos           :', sum(out.videos));
  console.log('Liked pages      :', sum(out.liked_pages));
  console.log('Friends          :', sum(out.friends));
  console.log('Pages managed    :', (out.pages || []).length);
  console.log('Saved to         :', file);
})().catch(e => console.error('FATAL:', e.message));
