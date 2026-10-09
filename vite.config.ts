import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          /**
           * `clsx` + `tailwind-merge` ARE `cn()`'s dependencies, and `cn()` is
           * imported by nearly every component — i.e. by the eager entry graph.
           * They are ALSO dependencies of recharts, so without this line Rollup
           * swept them into the `charts` chunk and the entry chunk ended up with
           * a static `import { c } from "./charts-*.js"`. That single edge made
           * `index.html` modulepreload the whole 423 KB Recharts bundle on EVERY
           * route, including the many that never render a chart — exactly what
           * splitting `charts` off was supposed to prevent. Pinning them to
           * their own chunk keeps that edge from ever forming again.
           */
          vendor: ['clsx', 'tailwind-merge'],
          /**
           * All 191 icons in ONE cached chunk. Rollup split every icon shared
           * by two lazy pages into its own 350-byte file (35 of them survived
           * even the min-chunk-size merge below) — one request each, on every
           * page that used it. The shell already loads 80 icons on first paint,
           * so the whole set costs ~20 KB gzip once and is then cached.
           */
          icons: ['lucide-react'],
        },
        /**
         * ⚠️ `experimentalMinChunkSize` WAS TRIED AND REVERTED (2026-09-11). It
         * folds a tiny shared chunk into whichever chunk happens to import it,
         * so an unrelated PAGE becomes the home of a helper another page needs —
         * measured: /holidays started loading LmsPage (32 KB), EmployeePicker
         * (28 KB) and a 43 KB chunk of the dashboard's ring, +210 KB of JS for
         * one screen. Fewer requests, far more bytes. The icons chunk above is
         * what actually removed the confetti (35 one-icon files); the remaining
         * small shared chunks are shared code and belong shared.
         */
      },
    },
  },
  server: {
    port: 3001,
    proxy: {
      // Dev proxy → live API (same as the v1 frontend).
      '/api': {
        target: 'https://hr-api.uzgidro.uz',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      /**
       * MAP TILES — our own tileserver, exactly as `default.conf` proxies them
       * in the built image.
       *
       * ⚠️ WITHOUT THIS THE MAP IS DEAD IN `npm run dev` ONLY: the style sheet
       * is fetched from `/tiles/styles/…/style.json`, which the dev server
       * answers with its index.html 404 while the deployed nginx proxies it
       * fine — so the vehicle map worked in TEST and failed on localhost.
       *
       * ⚠️ THE DEFAULT MUST BE REACHABLE FROM THE DEVELOPER'S MACHINE. It used
       * to be the tileserver's address on THIS server's docker bridge
       * (172.18.0.15), which exists only on the server — so `npm run dev`
       * anywhere else got a dead map, exactly the symptom the comment above
       * warns about. The deployed host already publishes the same tiles, so
       * that is the default now; the docker address still works as an override
       * when developing ON the server:
       *     VITE_TILES_TARGET=http://172.18.0.15:8080 npm run dev
       */
      '/tiles': {
        target: process.env.VITE_TILES_TARGET || 'https://hr.uzgidro.uz/tiles',
        changeOrigin: true,
        secure: false,
        // Same rewrite for both targets: vite appends the remaining path, so
        // stripping the prefix gives `<target>/styles/…` either way.
        rewrite: (p) => p.replace(/^\/tiles/, ''),
      },
    },
  },
})
