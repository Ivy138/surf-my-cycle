const { allowCors, getUserFromRequest, json, readJsonBody } = require('./_lib');

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const DEFAULT_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });
  if (!MINIMAX_API_KEY) return json(res, 503, { error: 'Missing MINIMAX_API_KEY' });

  try {
    const body = await readJsonBody(req);
    const upstream = await fetch('https://api.minimaxi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + MINIMAX_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages: body.messages,
        stream: body.stream !== false
      })
    });

    if (!upstream.ok || !upstream.body) {
      return json(res, upstream.status, { error: await upstream.text() });
    }

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of upstream.body) {
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (error) {
    json(res, 500, { error: error.message || 'AI request failed' });
  }
};
