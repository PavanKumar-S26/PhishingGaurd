import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/node_modules/recharts/es6/chart/')) return 'chart-core';
          if (id.includes('/node_modules/recharts/es6/')) return 'chart-components';
          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (id.includes('/node_modules/d3-') || id.includes('/node_modules/internmap/')) return 'chart-data';
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
          if (id.includes('/node_modules/axios/')) return 'http';
          return undefined;
        },
      },
    },
  },
});
