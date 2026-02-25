// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },

  // Generate static files for production
  ssr: false,

  // Output directory for the static build
  nitro: {
    preset: 'static',
    output: {
      publicDir: '.output/public'
    }
  },

  app: {
    head: {
      title: 'VS Code',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'VS Code editor with OPFS persistence' }
      ]
    },
    baseURL: '/'
  },

  // Use hash-based routing for iframe/srcdoc compatibility
  router: {
    options: {
      hashMode: true
    }
  },

  // Disable app manifest to prevent 404 fetches in bundled mode
  experimental: {
    appManifest: false
  },

  // Configure Vite for building
  vite: {
    build: {
      minify: true,
      sourcemap: false,

      // Target modern browsers for smaller output
      target: 'esnext',

      // Inline all assets up to 200KB as base64 data URIs
      // (raised to accommodate @vscode/codicons TTF font ~123KB)
      assetsInlineLimit: 200 * 1024,

      rollupOptions: {
        output: {
          // Inline all dynamic imports into a single chunk
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },
  },

  // Import VS Code's codicons icon font globally
  css: [
    '@vscode/codicons/dist/codicon.css',
  ],
})
