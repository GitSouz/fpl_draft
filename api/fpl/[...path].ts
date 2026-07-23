// Vercel serverless function: proxies the FPL API in production (the Vite dev
// proxy only exists in `npm run dev`). The browser calls /api/fpl/... on the
// same origin and this relays it to fantasy.premierleague.com from the server,
// where CORS doesn't apply. Mirrors the header set in vite.config.ts.
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
    // Strip the /api/fpl prefix and forward the remaining path + query.
    const rest = String(req.url || '').replace(/^\/api\/fpl/, '');
    const target = `https://fantasy.premierleague.com/api${rest}`;

    const upstream = await fetch(target, { headers: BROWSER_HEADERS });
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader(
      'content-type',
      upstream.headers.get('content-type') || 'application/json'
    );
    // Small cache so repeated loads during setup are snappy.
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
    res.send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Failed to reach the FPL API',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
