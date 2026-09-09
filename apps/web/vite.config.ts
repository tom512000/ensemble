import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3005',
      '/socket.io': { target: 'http://127.0.0.1:3005', ws: true },
    },
  },
  // Same relay for the built bundle, so the production build can be tried locally.
  preview: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3005',
      '/socket.io': { target: 'http://127.0.0.1:3005', ws: true },
    },
  },
  optimizeDeps: { exclude: ['@ensemble/shared'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/zod/')) return 'validation';
          if (id.includes('socket.io') || id.includes('engine.io') || id.includes('@socket.io'))
            return 'realtime';
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react';
        },
      },
    },
  },
});
