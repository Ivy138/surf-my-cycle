const { allowCors, createSession, getUserFromRequest, json } = require('./_lib');

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: '刷新登录状态失败' });

  return json(res, 200, {
    session: createSession({
      id: user.id,
      username: user.username
    })
  });
};
