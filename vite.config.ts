import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web' },
  server: {
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      new URL(process.env.APP_ORIGIN || 'http://localhost:8080').hostname,
    ],
    watch: { usePolling: true },
  },
});
