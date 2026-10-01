const fs = require('fs');
const axios = require('axios');
const store = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '.mcp_token_store.json'), 'utf-8'));

const pageToken = store.page_access_tokens['1326722813860832'];
const pageId = '1326722813860832';

// Valid metrics for pages with basic permissions
const metrics = [
  'page_post_engagements',
  'page_views_total',
  'page_actions_post_reactions_total',
  'page_fans',
  'page_fan_adds_by_paid_non_paid_unique',
  'page_video_views',
  'page_content_activity',
  'page_daily_follows',
  'page_daily_follows_unique',
];

const periods = ['day', 'week', 'days_28'];

async function getInsights() {
  console.log('\n📊 Ramtechie — Page Insights (All Available Metrics)');
  console.log('='.repeat(62));

  for (const metric of metrics) {
    for (const period of periods) {
      try {
        const res = await axios.get(`https://graph.facebook.com/v26.0/${pageId}/insights/${metric}`, {
          params: { access_token: pageToken, period },
        });
        const data = res.data.data;
        if (!data || data.length === 0) continue;
        const item = data[0];
        const values = (item.values || []).slice(-3);
        const hasNonZero = values.some(v => {
          const val = typeof v.value === 'object' ? Object.values(v.value).some(x => x > 0) : v.value > 0;
          return val;
        });

        console.log(`\n📌 ${item.title || metric}  [${period}]`);
        values.forEach(v => {
          const date = new Date(v.end_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const val = typeof v.value === 'object' ? JSON.stringify(v.value) : v.value;
          console.log(`   ${date} : ${val}`);
        });
        break; // only need first valid period
      } catch {
        // skip invalid metric+period combinations silently
      }
    }
  }

  // Also fetch page-level summary (fans, followers)
  try {
    const summary = await axios.get(`https://graph.facebook.com/v26.0/${pageId}`, {
      params: {
        access_token: pageToken,
        fields: 'name,fan_count,followers_count,talking_about_count,posts_count',
      },
    });
    const d = summary.data;
    console.log('\n' + '='.repeat(62));
    console.log('📈 Page Summary');
    console.log('='.repeat(62));
    console.log(`   Page Name       : ${d.name}`);
    console.log(`   Total Fans/Likes: ${d.fan_count ?? 'N/A'}`);
    console.log(`   Followers       : ${d.followers_count ?? 'N/A'}`);
    console.log(`   Talking About   : ${d.talking_about_count ?? 'N/A'}`);
  } catch (e) {
    console.error('Summary error:', e.response?.data?.error?.message || e.message);
  }

  console.log('\n' + '='.repeat(62));
  console.log('✅ Done.');
}

getInsights();
