import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The official FPL API does not send CORS headers, so a browser page cannot
// fetch it directly. In local dev we relay it through Vite's dev-server proxy:
// the browser calls /api/fpl/... (same origin) and Vite forwards it to
// fantasy.premierleague.com from Node, where CORS does not apply.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fpl': {
        target: 'https://fantasy.premierleague.com',
        changeOrigin: true,
        secure: true,
        // Strip the /api/fpl prefix and ensure a trailing slash on the path
        // (before any query string) — FPL 404s without it.
        rewrite: (path) => {
          const stripped = path.replace(/^\/api\/fpl/, '/api');
          const [p, q] = stripped.split('?');
          const withSlash = p.endsWith('/') ? p : `${p}/`;
          return q ? `${withSlash}?${q}` : withSlash;
        },
        headers: {
          // The FPL API sits behind Cloudflare, which returns 403/503 to
          // requests that don't look like a real browser. Send a full,
          // current browser header set so it's treated as a normal visitor.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://fantasy.premierleague.com/',
          Origin: 'https://fantasy.premierleague.com',
          'sec-ch-ua':
            '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      },
    },
  },
});
