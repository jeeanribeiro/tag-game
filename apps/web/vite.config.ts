import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 43151,
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:43150',
        ws: true,
      },
    },
  },
  preview: {
    port: 43152,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
