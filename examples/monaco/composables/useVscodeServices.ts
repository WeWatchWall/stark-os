/**
 * VS Code Services Initialization for Stark Code.
 *
 * Uses @codingame/monaco-vscode-api to bring real VS Code services to the
 * Monaco editor, replacing the limited standalone services.
 *
 * This module must be called ONCE before the first editor is created.
 *
 * Services enabled:
 * - Theme service (VS Code themes with TextMate grammar support)
 * - TextMate service (proper tokenization/syntax highlighting)
 * - Languages service (language detection, configuration)
 * - Configuration service (VS Code settings.json support)
 * - Keybindings service (VS Code keybindings)
 * - Model service (document model management)
 * - Editor service (multi-editor support)
 * - Lifecycle service (shutdown management)
 *
 * Default extensions loaded:
 * - Theme Defaults (Dark+, Light+, High Contrast themes)
 * - JavaScript language support
 * - TypeScript language support
 * - JSON language support
 * - HTML language support
 * - CSS language support
 * - Markdown language support
 */

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize VS Code services. Safe to call multiple times — only the first
 * call performs initialization; subsequent calls return the same promise.
 */
export async function initializeVscodeServices(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = doInitialize();
  await initPromise;
  initialized = true;
}

async function doInitialize(): Promise<void> {
  // Dynamic imports — only loaded on first call
  const { initialize } = await import('@codingame/monaco-vscode-api');

  // Service overrides
  const [
    { default: getThemeServiceOverride },
    { default: getTextmateServiceOverride },
    { default: getLanguagesServiceOverride },
    { default: getConfigurationServiceOverride },
    { default: getKeybindingsServiceOverride },
    { default: getModelServiceOverride },
    { default: getEditorServiceOverride },
    { default: getLifecycleServiceOverride },
  ] = await Promise.all([
    import('@codingame/monaco-vscode-theme-service-override'),
    import('@codingame/monaco-vscode-textmate-service-override'),
    import('@codingame/monaco-vscode-languages-service-override'),
    import('@codingame/monaco-vscode-configuration-service-override'),
    import('@codingame/monaco-vscode-keybindings-service-override'),
    import('@codingame/monaco-vscode-model-service-override'),
    import('@codingame/monaco-vscode-editor-service-override'),
    import('@codingame/monaco-vscode-lifecycle-service-override'),
  ]);

  // Initialize with all service overrides
  await initialize({
    ...getThemeServiceOverride(),
    ...getTextmateServiceOverride(),
    ...getLanguagesServiceOverride(),
    ...getConfigurationServiceOverride(),
    ...getKeybindingsServiceOverride(),
    ...getModelServiceOverride(),
    ...getEditorServiceOverride(),
    ...getLifecycleServiceOverride(),
  });

  // Load default extensions (theme + language support)
  await Promise.all([
    import('@codingame/monaco-vscode-theme-defaults-default-extension'),
    import('@codingame/monaco-vscode-javascript-default-extension'),
    import('@codingame/monaco-vscode-typescript-basics-default-extension'),
    import('@codingame/monaco-vscode-json-default-extension'),
    import('@codingame/monaco-vscode-html-default-extension'),
    import('@codingame/monaco-vscode-css-default-extension'),
    import('@codingame/monaco-vscode-markdown-basics-default-extension'),
  ]);
}

/**
 * Returns whether VS Code services have been initialized.
 */
export function isVscodeInitialized(): boolean {
  return initialized;
}
