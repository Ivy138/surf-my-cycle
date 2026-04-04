const {
  allowCors,
  createSession,
  getRegistryUser,
  getStableUserId,
  hashPassword,
  json,
  readJsonBody,
  saveRegistryUser
} = require('./_lib');

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { username, password } = await readJsonBody(req);
    if (!username || !password) return json(res, 400, { error: '缺少账号或密码' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json(res, 400, { error: '账号格式不正确' });
    if (String(password).length < 6) return json(res, 400, { error: '密码至少 6 位' });

    const normalizedUsername = username.trim().toLowerCase();
    const existing = await getRegistryUser(normalizedUsername);
    if (existing) return json(res, 409, { error: '该账号已被注册' });

    const user = {
      id: getStableUserId({ username: normalizedUsername }),
      username: normalizedUsername,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    const saved = await saveRegistryUser(user);
    if (!saved) return json(res, 500, { error: '注册失败，无法保存账号' });

    return json(res, 200, { session: createSession(user) });
  } catch (error) {
    return json(res, 500, { error: error.message || '注册失败' });
  }
};
