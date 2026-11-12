import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    // '@' alias for shadcn/Watermelon UI components (they import from '@/lib/utils' etc).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Chatty logging is dropped from the packaged app: in a WebView it all lands
  // in logcat, where booking details and addresses have no business being.
  // warn and error survive, because with no crash reporter wired yet they are
  // the only signal left when something fails on a real handset.
  esbuild: {
    pure: command === 'build' ? ['console.log', 'console.debug', 'console.info'] : [],
  },
  // Don't ship source maps in the production bundle (avoid leaking source).
  build: {
    sourcemap: false,
    minify: 'terser', // Use terser instead of rolldown to avoid TDZ bug
    terserOptions: {
      compress: {
        // Avoid TDZ issues with certain patterns
        passes: 2,
      },
      mangle: {
        // Prevent mangle from causing TDZ issues
        safari10: true,
      },
    },
    // Also configure rolldown to avoid issues
    rolldownOptions: {
      output: {
        // Disable compact output which can cause TDZ issues
        compact: false,
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
}))
