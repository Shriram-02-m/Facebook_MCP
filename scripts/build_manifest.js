const axios = require('axios');
const fs = require('fs');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));
const userToken = store.consumer_user_access_token;

(async () => {
  const res = await axios.get('https://graph.facebook.com/v26.0/me/posts', {
    params: { access_token: userToken, limit: 50, fields: 'id,message,story,created_time,permalink_url,attachments' },
  });
  const manifest = res.data.data.filter(p => p.attachments && p.attachments.data);
  const out = manifest.map(p => {
    const att = p.attachments.data[0];
    return {
      source_post_id: p.id,
      date: p.created_time,
      caption: p.message || null,
      story: p.story || null,
      permalink: p.permalink_url,
      attachment_type: att.type,
      image_src: att.media && att.media.image ? att.media.image.src : null,
      image_size: att.media && att.media.image
        ? att.media.image.width + 'x' + att.media.image.height : null,
    };
  });
  fs.writeFileSync(path.join(__dirname, '..', 'transfer_manifest.json'), JSON.stringify(out, null, 2));
  out.forEach((p, i) => {
    console.log('[' + (i + 1) + '] ' + p.date.slice(0, 10) + '  ' + (p.image_size || '?'));
    console.log('     caption : ' + (p.caption || '(none)'));
    console.log('     story   : ' + (p.story || '(none)'));
    console.log('     type    : ' + p.attachment_type);
    console.log('     link    : ' + (p.permalink || ''));
  });
  console.log('\nsaved transfer_manifest.json — ' + out.length + ' entries');
})().catch(e => console.error('ERROR:', e.response?.data?.error?.message || e.message));
