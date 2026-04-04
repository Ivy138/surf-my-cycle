const { allowCors, getUserFromRequest, json, readJsonBody } = require('./_lib');

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

function enhanceSearchQuery(query) {
  const cycleKeywords = [
    'menstrual cycle', 'follicular phase', 'luteal phase', 'ovulation',
    'estrogen', 'progesterone', 'premenstrual', 'hormonal fluctuations'
  ];
  const healthKeywords = [
    'burnout', 'fatigue', 'energy levels', 'cognitive performance',
    'mood changes', 'sleep quality', 'work productivity'
  ];
  const lowerQuery = String(query || '').toLowerCase();
  const needsScientificContext = cycleKeywords.some(kw => lowerQuery.includes(kw.replace(/\s/g, ''))) ||
    healthKeywords.some(kw => lowerQuery.includes(kw.split(' ')[0]));
  return needsScientificContext ? `${query} scientific research study evidence` : query;
}

module.exports = async (req, res) => {
  if (allowCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await getUserFromRequest(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  try {
    const body = await readJsonBody(req);
    const enhancedQuery = enhanceSearchQuery(body.query || '');
    if (!TAVILY_API_KEY) return json(res, 503, { error: 'Missing TAVILY_API_KEY' });

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TAVILY_API_KEY
      },
      body: JSON.stringify({
        query: enhancedQuery,
        search_depth: body.search_depth || 'basic',
        max_results: body.max_results || 5,
        include_answer: true,
        include_domains: Array.isArray(body.include_domains) && body.include_domains.length > 0
          ? body.include_domains
          : [
              'ncbi.nlm.nih.gov',
              'pubmed.ncbi.nlm.nih.gov',
              'sciencedirect.com',
              'nature.com',
              'frontiersin.org',
              'who.int'
            ]
      })
    });
    const payload = await response.text();
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(payload);
  } catch (error) {
    json(res, 500, { error: error.message || 'Search failed' });
  }
};
