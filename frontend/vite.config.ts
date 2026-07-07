import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  base: './',
  plugins: [
    react({
      babel: {
        plugins: ['@babel/plugin-transform-runtime'],
      },
    }),
  ],
  css: {
    postcss: {
      plugins: [
        autoprefixer({ overrideBrowserslist: ['Edge >= 92', 'Chrome >= 92'] }),
      ],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
  optimizeDeps: {
    // @ado-hierarchy-viewer/query-match-core is a symlinked npm-workspace package (CJS
    // output). Vite's dev server treats linked monorepo packages as source and serves them
    // via native ESM by default, but native ESM can't do named-export interop on a raw CJS
    // module — named imports fail at runtime ("does not provide an export named ..."; see
    // the matching commonjsOptions.include note in build.commonjsOptions below, which only
    // covers `vite build`, not `vite dev`). Including it here makes esbuild pre-bundle it
    // to real ESM for dev, same effect the production build gets for free via Rollup.
    include: ['@ado-hierarchy-viewer/query-match-core'],
  },
  build: {
    outDir: 'ado-extension/dist',
    emptyOutDir: true,
    target: ['es2015', 'edge92', 'chrome92'],
    cssTarget: 'chrome61',
    minify: 'terser',
    terserOptions: {
      compress: { ecma: 2015 },
      format: { ecma: 2015 },
    },
    commonjsOptions: {
      // @ado-hierarchy-viewer/query-match-core is an npm-workspace package, symlinked
      // into node_modules. Rollup's commonjs plugin resolves symlinks to their real path
      // (packages/query-match-core/dist) before matching `include`, which sits outside
      // node_modules — so the default [/node_modules/] pattern silently skips CJS/ESM
      // interop for it, and named imports fail at build time ("X is not exported by").
      include: [/node_modules/, /packages\/query-match-core/],
    },
    rollupOptions: {
      output: {
        // Split vendor deps into cacheable chunks instead of one eager bundle —
        // the ADO hub iframe otherwise loads all of MUI/emotion + the tree list
        // library before the first paint. React/ADO-SDK chunk changes rarely and
        // stays cached across our own app-code releases.
        manualChunks: {
          // Note: react/react-dom are intentionally left out of manualChunks — with the
          // automatic JSX runtime they're pulled in per-file rather than referenced as a
          // bare "react" module, so a dedicated chunk for them comes out empty.
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-virtuoso': ['react-virtuoso'],
          'vendor-ado-sdk': ['azure-devops-extension-sdk', 'azure-devops-extension-api'],
        },
      },
    },
  },
  worker: {
    format: 'iife',
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    typecheck: { tsconfig: './tsconfig.test.json' },
  },
});
