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
