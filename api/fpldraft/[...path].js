// Vercel serverless function: proxies the FPL *Draft* API
// (draft.premierleague.com) for the league dashboard, the same way
// api/fpl/[...path].js proxies the classic FPL API. The browser calls
// /api/fpldraft/... on the same origin and this relays it server-side, where
// CORS doesn't apply. `npm run dev` uses the matching Vite proxy instead.

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://draft.premierleague.com/',
  Origin: 'https://draft.premierleague.com',
};

export default async function handler(req, res) {
  try {
    const parts = req.query && req.query.path;
    let path = Array.isArray(parts)
      ? parts.join('/')
      : typeof parts === 'string'
        ? parts
        : '';
    if (!path) {
      path = String(req.url || '')
        .split('?')[0]
        .replace(/^\/api\/fpldraft\/?/, '');
    }
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');

    // Only relay simple API paths (letters, digits, slashes, dashes).
    if (!/^[a-z0-9\-/]+$/i.test(path)) {
      res.status(400).json({ error: 'Bad path' });
      return;
    }

    const upstream = await fetch(`https://draft.premierleague.com/api/${path}`, {
      headers: BROWSER_HEADERS,
    });
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
      error: 'Failed to reach the FPL Draft API',
      detail: err && err.message ? err.message : String(err),
    });
  }
}
