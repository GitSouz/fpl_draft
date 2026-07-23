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
        rewrite: (path) => path.replace(/^\/api\/fpl/, '/api'),
        headers: {
          // FPL occasionally rejects requests without a browser-like UA.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      },
    },
  },
});
