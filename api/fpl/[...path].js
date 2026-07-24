// Vercel serverless function (plain JS so Vercel runs it directly without
// touching the frontend's tsconfig). Proxies the FPL API in production — the
// browser calls /api/fpl/... on the same origin and this relays it to
// fantasy.premierleague.com, where CORS doesn't apply. The Vite dev server has
// its own proxy for `npm run dev`.

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://fantasy.premierleague.com/',
  Origin: 'https://fantasy.premierleague.com',
};

export default async function handler(req, res) {
  try {
    // Vercel populates req.query.path for the [...path] catch-all; fall back to
    // parsing the URL just in case.
    const parts = req.query && req.query.path;
    let path = Array.isArray(parts)
      ? parts.join('/')
      : typeof parts === 'string'
        ? parts
        : '';
    if (!path) {
      path = String(req.url || '')
        .split('?')[0]
        .replace(/^\/api\/fpl\/?/, '');
    }

    path = path.replace(/^\/+/, '');
    // FPL endpoints require a trailing slash (e.g. /api/bootstrap-static/).
    if (path && !path.endsWith('/')) path += '/';

    const target = `https://fantasy.premierleague.com/api/${path}`;
    const upstream = await fetch(target, { headers: BROWSER_HEADERS });
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader(
      'content-type',
      upstream.headers.get('content-type') || 'application/json'
    );
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
    res.send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Failed to reach the FPL API',
      detail: err && err.message ? err.message : String(err),
    });
  }
}
