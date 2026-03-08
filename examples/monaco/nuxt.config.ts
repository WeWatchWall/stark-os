// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Vite plugin that inlines all assets (WASM, JSON, HTML) referenced via
 * `new URL(path, import.meta.url)` as base64 data URIs. This is required
 * for the single-bundle deployment model where no separate asset files
 * can exist alongside the main JS bundle.
 *
 * Targets the VS Code service packages that load:
 * - onig.wasm (Oniguruma regex engine for TextMate grammars)
 * - *.tmLanguage.json (TextMate grammar definitions)
 * - webWorkerExtensionHostIframe.html (extension host frame)
 */
function vscodeAssetInlinePlugin(): Plugin {
  const MIME: Record<string, string> = {
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.html': 'text/html',
  };

  return {
    name: 'vscode-asset-inline',
    enforce: 'pre',

    // Transform the code that uses new URL() patterns to inline the assets.
    // This catches references BEFORE Vite's own asset handling processes them.
    transform(code, id) {
      // Skip non-JS files and files outside our target packages
      // Handle both direct and pnpm-symlinked paths
      if (!id.includes('monaco-vscode') && !id.includes('monaco-editor')) return null;
      if (!code.includes('new URL(')) return null;

      // Replace: new URL('...path...', import.meta.url)
      // With: an inline data URI string
      const urlPattern = /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
      let transformed = code;
      let hasReplacement = false;

      transformed = transformed.replace(urlPattern, (match, relativePath) => {
        const ext = extname(relativePath);
        const mime = MIME[ext];

        // Only inline known asset types from VS Code packages
        if (!mime) return match;

        try {
          // Resolve the file relative to the importing module
          const dir = id.substring(0, id.lastIndexOf('/'));
          const absPath = resolve(dir, relativePath);
          const content = readFileSync(absPath);
          const base64 = content.toString('base64');
          const dataUri = `data:${mime};base64,${base64}`;
          hasReplacement = true;
          return `new URL("${dataUri}")`;
        } catch {
          // If we can't read the file, leave the original reference
          return match;
        }
      });

      if (!hasReplacement) return null;
      return { code: transformed, map: null };
    },

    // Post-build: inline any remaining asset references that Vite's own
    // new URL() handler emitted as separate files (e.g. HTML, WASM).
    // This runs after Vite has already hashed and emitted asset files.
    generateBundle(_options, bundle) {
      // Collect assets we want to inline
      const assetsToInline = new Map<string, string>();
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'asset') continue;
        const ext = extname(fileName);
        const mime = MIME[ext];
        if (!mime) continue;

        // Convert the asset content to a data URI
        const content = chunk.source;
        const buf = typeof content === 'string'
          ? Buffer.from(content, 'utf-8')
          : Buffer.from(content);
        const base64 = buf.toString('base64');
        // Use just the basename as the key since JS references use basenames
        const baseName = fileName.split('/').pop() || fileName;
        assetsToInline.set(baseName, `data:${mime};base64,${base64}`);
        // Also map the full path
        if (baseName !== fileName) {
          assetsToInline.set(fileName, `data:${mime};base64,${base64}`);
        }
      }

      if (assetsToInline.size === 0) return;

      // Replace references in JS chunks and delete the separate asset files
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        let code = chunk.code;
        let changed = false;
        for (const [fileName, dataUri] of assetsToInline) {
          // Match patterns like: new URL("filename.hash.ext", import.meta.url)
          // and also: ""+new URL("filename.hash.ext",import.meta.url).href
          if (code.includes(fileName)) {
            code = code.replaceAll(
              `new URL("${fileName}",import.meta.url)`,
              `new URL("${dataUri}")`
            );
            code = code.replaceAll(
              `new URL("${fileName}", import.meta.url)`,
              `new URL("${dataUri}")`
            );
            changed = true;
          }
        }
        if (changed) {
          chunk.code = code;
        }
      }

      // Remove inlined assets from the bundle (match by basename or full path)
      for (const bundleKey of Object.keys(bundle)) {
        const baseName = bundleKey.split('/').pop() || bundleKey;
        if (assetsToInline.has(baseName) || assetsToInline.has(bundleKey)) {
          delete bundle[bundleKey];
        }
      }
    },
  };
}

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },

  // Extend the shared Nuxt layer (auto-imports components and utils)
  extends: ['../shared'],

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
      title: 'Stark Code',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Stark Code editor with OPFS persistence' }
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

  // Remove stale prefetch hints for inlined assets from generated HTML
  hooks: {
    'nitro:config'(config) {
      config.hooks = config.hooks || {};
      config.hooks['prerender:generate'] = async (route: { contents?: string }) => {
        if (route.contents && typeof route.contents === 'string') {
          // Remove <link rel="prefetch"> for assets we inlined
          route.contents = route.contents.replace(
            /<link\s+rel="prefetch"\s+href="[^"]*\.(wasm|tmLanguage\.json|html)"[^>]*>/g,
            ''
          );
        }
      };
    },
  },

  // Configure Vite for building
  vite: {
    plugins: [
      // Inline all VS Code service assets (WASM, JSON, HTML) as data URIs
      // so the build produces a single self-contained bundle
      vscodeAssetInlinePlugin(),
    ],

    build: {
      minify: true,
      sourcemap: false,

      // Target modern browsers for smaller output
      target: 'esnext',

      // Inline standard assets (fonts, images) up to 500KB as base64 data URIs.
      // The VS Code WASM/JSON/HTML assets are handled separately by the
      // vscodeAssetInlinePlugin above, so this limit primarily covers
      // @vscode/codicons TTF font (~123KB) and other small assets.
      assetsInlineLimit: 500 * 1024,

      rollupOptions: {
        output: {
          // Inline all dynamic imports into a single chunk
          inlineDynamicImports: true,
          manualChunks: undefined,
        },
      },
    },

    // Resolve aliases so that @codingame/monaco-vscode-editor-api
    // works as a drop-in replacement for monaco-editor
    resolve: {
      dedupe: ['monaco-editor'],
      alias: {
        // isomorphic-git references the Node.js `buffer` built-in, which Vite
        // externalizes by default.  Point it at the npm `buffer` polyfill so
        // `Buffer` is available in the browser.
        buffer: 'buffer/',
      },
    },

    // Optimize deps to include VS Code service packages
    optimizeDeps: {
      include: [
        'buffer',
        '@codingame/monaco-vscode-api',
        '@codingame/monaco-vscode-theme-service-override',
        '@codingame/monaco-vscode-textmate-service-override',
        '@codingame/monaco-vscode-languages-service-override',
        '@codingame/monaco-vscode-configuration-service-override',
        '@codingame/monaco-vscode-keybindings-service-override',
        '@codingame/monaco-vscode-model-service-override',
        '@codingame/monaco-vscode-editor-service-override',
        '@codingame/monaco-vscode-lifecycle-service-override',
      ],
    },
  },

  // Import codicons icon font globally
  css: [
    '@vscode/codicons/dist/codicon.css',
  ],
})
