import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    middlewareMode: true,
    hmr: { server: undefined },
  },
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    clearMocks: true,
  },
});
