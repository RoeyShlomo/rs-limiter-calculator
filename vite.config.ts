import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the project at /<repo>/, so the base path is set for the
// production build and left at / for local development.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rs-limiter-calculator/' : '/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
}));
