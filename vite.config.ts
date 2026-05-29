import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/WIMPS/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
