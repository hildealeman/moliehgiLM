import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Default to empty string if env var is missing to avoid "undefined" issues
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    }
  };
});