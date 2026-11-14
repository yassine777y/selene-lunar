import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules/three/')) return 'lunar-engine'; } } },
  },
  server: {
    host: true,
    port: 5173,
    // Allow the Arena / E2B preview host and any tunnel to reach the dev server.
    allowedHosts: true,
    strictPort: false,
  },
  preview: { host: true, allowedHosts: true },
});
