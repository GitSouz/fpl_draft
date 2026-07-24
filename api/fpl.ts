// Vercel serverless function: proxies the FPL API in production (the Vite dev
// proxy only exists in `npm run dev`). The browser calls /api/fpl/... on the
// same origin; a rewrite in vercel.json routes it here as /api/fpl?path=...
// and this relays it to fantasy.premierleague.com, where CORS doesn't apply.
//
// This file lives outside src/ so it is NOT part of the frontend tsc build;
// Vercel compiles and runs it as a Node function.

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://fantasy.premierleague.com/',
  Origin: 'https://fantasy.premierleague.com',
};

// Using loose types so no @vercel/node dependency is required.
export default async function handler(req: any, res: any): Promise<void> {
  try {
    // The FPL path comes from the rewrite's ?path=... ; fall back to parsing
    // the URL directly in case the request reaches here unrewritten.
    let path = '';
    const q = req.query?.path;
    if (Array.isArray(q)) path = q.join('/');
    else if (typeof q === 'string') path = q;
    if (!path) {
      path = String(req.url || '')
        .split('?')[0]
        .replace(/^\/api\/fpl\/?/, '');
    }

    path = path.replace(/^\/+/, ''); // no leading slash
    // FPL endpoints require a trailing slash (e.g. /api/bootstrap-static/);
    // Vercel strips it from the incoming URL, so re-add it here.
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
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
