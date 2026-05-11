const { json, supabaseFetch } = require('./_lib');
const { sendPushToSubscription } = require('../lib/push');

const CRON_SECRET = process.env.CRON_SECRET;

const SLOT_MESSAGES = {
  morning: { title: '🌅 早安，记录一下', body: '新的一天开始了，现在精力如何？' },
  afternoon: { title: '☀️ 下午好', body: '下午过半了，记录一下当前状态吧' },
  evening: { title: '🌙 晚安时刻', body: '今天辛苦了，记录一下今晚的感受' }
};

function getSlotForHour(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});

  if (!CRON_SECRET) {
    return json(res, 500, { error: 'CRON_SECRET not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${CRON_SECRET}` && req.headers['x-cron-secret'] !== CRON_SECRET) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    const subRes = await supabaseFetch(
      '/rest/v1/memory?key=eq.push_subscription&select=user_id,value',
      {}, true
    );
    const rows = await subRes.json();
    if (!rows || !rows.length) {
      return json(res, 200, { sent: 0, message: 'No subscriptions' });
    }

    const now = new Date();
    const cnHour = (now.getUTCHours() + 8) % 24;
    const slot = getSlotForHour(cnHour);
    const msg = SLOT_MESSAGES[slot];

    let sent = 0, failed = 0, cleaned = 0;

    for (const row of rows) {
      let sub = row.value;
      if (typeof sub === 'string') {
        try { sub = JSON.parse(sub); } catch (_) { continue; }
      }
      if (!sub || !sub.endpoint) continue;

      try {
        await sendPushToSubscription(sub, {
          title: msg.title,
          body: msg.body,
          data: { action: 'quick-checkin', slot }
        });
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseFetch(
            `/rest/v1/memory?user_id=eq.${row.user_id}&key=eq.push_subscription`,
            { method: 'DELETE' }, true
          );
          cleaned++;
        }
      }
    }

    return json(res, 200, { sent, failed, cleaned, slot });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
