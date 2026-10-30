import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Lets SCSS modules write `@use 'breakpoints'` instead of long relative paths.
      scss: { loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))] },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // API_PORT lets end-to-end tests pair a second web server with a differently set-up API.
      '/api': `http://localhost:${process.env.API_PORT ?? '3000'}`,
    },
  },
});
