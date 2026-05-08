import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const archonUrl = env.VITE_ARCHON_URL ?? 'http://localhost:3737';
  return {
    plugins: [react(), tailwind()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: archonUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
