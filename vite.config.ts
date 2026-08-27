import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const MAX_EDITOR_CHUNK_SIZE = 450_000;

/** Vite configuration with bounded chunks for the Markdown editor dependency graph. */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'markdown-editor',
              test: /node_modules[\\/]@milkdown[\\/]/,
              maxSize: MAX_EDITOR_CHUNK_SIZE,
            },
          ],
        },
      },
    },
  },
});
