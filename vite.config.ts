import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base: works on user.github.io/ AND user.github.io/repo-name/
  base: './',
  build: { target: 'es2020' },
});
