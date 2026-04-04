const { allowCors, getUserFromRequest, json, supabaseFetch } = require('./_lib');

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  try {
    const existingRes = await supabaseFetch(`/rest/v1/records?select=date&user_id=eq.${user.id}&limit=1`);
    const existing = existingRes.ok ? await existingRes.json() : [];

    const sourceRecordsRes = await supabaseFetch('/rest/v1/records?select=*&user_id=eq.default_user&order=date.asc');
    const sourceRecords = sourceRecordsRes.ok ? await sourceRecordsRes.json() : [];
    const payload = Array.isArray(existing) && existing.length > 0
      ? []
      : sourceRecords.map(({ id, created_at, updated_at, user_id, ...rest }) => ({
          ...rest,
          user_id: user.id
        }));
    if (payload.length > 0) {
      await supabaseFetch('/rest/v1/records', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      });
    }

    const sourceConfigRes = await supabaseFetch('/rest/v1/config?select=*&user_id=eq.default_user');
    const sourceConfig = sourceConfigRes.ok ? await sourceConfigRes.json() : [];
    let configMigrated = false;
    if (sourceConfig[0]) {
      const { id, updated_at, user_id, ...rest } = sourceConfig[0];
      const upsertRes = await supabaseFetch('/rest/v1/config', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          ...rest,
          user_id: user.id,
          value: { ...(rest.value || {}), updated_at: new Date().toISOString() }
        })
      });
      configMigrated = upsertRes.ok;
    }

    const existingConversationRes = await supabaseFetch(`/rest/v1/conversations?select=date&user_id=eq.${user.id}&limit=1`);
    const existingConversations = existingConversationRes.ok ? await existingConversationRes.json() : [];
    const sourceConversationRes = await supabaseFetch('/rest/v1/conversations?select=*&user_id=eq.default_user&order=date.asc');
    const sourceConversations = sourceConversationRes.ok ? await sourceConversationRes.json() : [];
    const conversationPayload = Array.isArray(existingConversations) && existingConversations.length > 0
      ? []
      : sourceConversations.map(({ id, created_at, updated_at, user_id, ...rest }) => ({
          ...rest,
          user_id: user.id
        }));
    let conversationsMigrated = 0;
    if (conversationPayload.length > 0) {
      const conversationRes = await supabaseFetch('/rest/v1/conversations', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(conversationPayload)
      });
      if (conversationRes.ok) conversationsMigrated = conversationPayload.length;
    }

    return json(res, 200, {
      recordsMigrated: payload.length,
      conversationsMigrated,
      configMigrated,
      storage: 'supabase'
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Migration failed' });
  }
};
