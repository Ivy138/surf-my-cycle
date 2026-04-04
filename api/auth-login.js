const {
  allowCors,
  createSession,
  getRegistryUser,
  json,
  readJsonBody,
  verifyPassword
} = require('./_lib');

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const { username, password } = await readJsonBody(req);
    if (!username || !password) return json(res, 400, { error: '缺少账号或密码' });

    const normalizedUsername = username.trim().toLowerCase();
    const user = await getRegistryUser(normalizedUsername);
    if (!user) return json(res, 401, { error: '账号不存在或密码错误' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return json(res, 401, { error: '账号不存在或密码错误' });

    return json(res, 200, { session: createSession(user) });
  } catch (error) {
    return json(res, 500, { error: error.message || '登录失败' });
  }
};
