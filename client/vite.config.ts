import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const apiProxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  // `vite preview` serves the production build; proxy the API the same way.
  preview: {
    proxy: apiProxy,
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than app code: cache them separately.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@base-ui/react'],
          data: ['@tanstack/react-query', 'zustand'],
          motion: ['motion'],
        },
      },
    },
  },
});
