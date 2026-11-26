import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
});
