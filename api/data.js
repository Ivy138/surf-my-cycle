const { allowCors, getUserFromRequest, json, readJsonBody, supabaseFetch } = require('./_lib');
const { vapidPublicKey, sendPushToSubscription } = require('../lib/push');

const ALLOWED_TABLES = new Set(['records', 'config', 'conversations', 'memory']);
const UPSERT_CONFLICT_KEYS = {
  records: 'user_id,date',
  config: 'user_id',
  conversations: 'user_id,date',
  memory: 'user_id,key'
};

function sanitizeFilters(userId, filters = {}) {
  const next = { ...filters };
  delete next.user_id;
  return { ...next, user_id: `eq.${userId}` };
}

function normalizeDeleteFilters(userId, filters = {}) {
  const next = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (key === 'user_id') return;
    next[key] = String(value).startsWith('eq.') ? value : `eq.${value}`;
  });
  next.user_id = `eq.${userId}`;
  return next;
}

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  try {
    if (req.query.push === 'public-key') {
      return json(res, 200, { publicKey: vapidPublicKey || '' });
    }

    if (req.method === 'POST') {
      const rawBody = await readJsonBody(req);

      if (rawBody.push === 'subscribe' && rawBody.subscription) {
        const record = { user_id: user.id, key: 'push_subscription', value: JSON.stringify(rawBody.subscription) };
        await supabaseFetch('/rest/v1/memory?on_conflict=user_id,key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(record)
        });
        return json(res, 200, { ok: true });
      }

      if (rawBody.push === 'unsubscribe') {
        await supabaseFetch(`/rest/v1/memory?user_id=eq.${user.id}&key=eq.push_subscription`, {
          method: 'DELETE'
        });
        return json(res, 200, { ok: true });
      }

      if (rawBody.push === 'test') {
        const subRes = await supabaseFetch(`/rest/v1/memory?user_id=eq.${user.id}&key=eq.push_subscription&select=value`);
        const rows = await subRes.json();
        if (!rows || !rows.length || !rows[0].value) {
          return json(res, 400, { error: '没有推送订阅记录，请先关闭再重新开启通知', debug: { rowCount: rows ? rows.length : 0 } });
        }
        let sub = rows[0].value;
        const rawType = typeof sub;
        if (typeof sub === 'string') {
          try { sub = JSON.parse(sub); } catch (e) {
            return json(res, 400, { error: '订阅数据解析失败: ' + e.message, debug: { rawType, raw: sub.substring(0, 200) } });
          }
        }
        if (!sub || !sub.endpoint) {
          return json(res, 400, { error: '订阅数据缺少endpoint', debug: { rawType, keys: sub ? Object.keys(sub) : null } });
        }
        try {
          await sendPushToSubscription(sub, {
            title: '🌊 Surf My Cycle',
            body: '测试通知成功！你可以随时记录当前状态。'
          });
        } catch (pushErr) {
          return json(res, 500, { error: '推送发送失败: ' + (pushErr.body || pushErr.message), debug: { statusCode: pushErr.statusCode, endpoint: sub.endpoint.substring(0, 80) } });
        }
        return json(res, 200, { ok: true });
      }

      req._parsedBody = rawBody;
    }

    if (req.method === 'GET') {
      const { table, ...query } = req.query;
      if (!ALLOWED_TABLES.has(table)) return json(res, 400, { error: 'Invalid table' });
      const params = new URLSearchParams(sanitizeFilters(user.id, query));
      const response = await supabaseFetch(`/rest/v1/${table}?${params.toString()}`);
      const payload = await response.text();
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(payload);
      return;
    }

    const body = req._parsedBody || await readJsonBody(req);
    const table = body.table;
    if (!ALLOWED_TABLES.has(table)) return json(res, 400, { error: 'Invalid table' });

    if (req.method === 'POST') {
      const record = { ...(body.record || {}), user_id: user.id };
      const params = new URLSearchParams();
      if (UPSERT_CONFLICT_KEYS[table]) {
        params.set('on_conflict', UPSERT_CONFLICT_KEYS[table]);
      }
      const path = `/rest/v1/${table}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await supabaseFetch(path, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(record)
      });
      const payload = await response.text();
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(payload);
      return;
    }

    if (req.method === 'DELETE') {
      const filters = normalizeDeleteFilters(user.id, body.filters || {});
      const params = new URLSearchParams(filters);
      const response = await supabaseFetch(`/rest/v1/${table}?${params.toString()}`, {
        method: 'DELETE'
      });
      return json(res, response.ok ? 200 : response.status, { ok: response.ok });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Data request failed' });
  }
};
