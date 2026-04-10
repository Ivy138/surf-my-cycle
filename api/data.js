const { allowCors, getUserFromRequest, json, readJsonBody, supabaseFetch } = require('./_lib');

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

    const body = await readJsonBody(req);
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
