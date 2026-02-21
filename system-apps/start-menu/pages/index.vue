<template>
  <div class="start-menu" @click.stop>
    <!-- Search / Header -->
    <div class="menu-header">
      <div class="menu-title">Applications</div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="menu-loading">
      <span class="spinner" />
      <span>Loading apps…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMsg" class="menu-error">
      <span>{{ errorMsg }}</span>
      <button class="retry-btn" @click="loadPacks">Retry</button>
    </div>

    <!-- App list -->
    <div v-else class="menu-body">
      <!-- Visual browser apps -->
      <div v-if="visualApps.length" class="category">
        <div class="category-label">Apps</div>
        <button
          v-for="app in visualApps"
          :key="app.name"
          class="app-item"
          @click="launchApp(app)"
        >
          <span class="app-icon visual">◈</span>
          <span class="app-name">{{ app.name }}</span>
        </button>
      </div>

      <!-- Web worker browser apps -->
      <div v-if="workerApps.length" class="category">
        <div class="category-label">Web Workers</div>
        <button
          v-for="app in workerApps"
          :key="app.name"
          class="app-item"
          @click="launchApp(app)"
        >
          <span class="app-icon worker">⌬</span>
          <span class="app-name">{{ app.name }}</span>
        </button>
      </div>

      <!-- Node.js apps -->
      <div v-if="nodeApps.length" class="category">
        <div class="category-label">Node.js</div>
        <button
          v-for="app in nodeApps"
          :key="app.name"
          class="app-item"
          @click="launchApp(app)"
        >
          <span class="app-icon node">⎈</span>
          <span class="app-name">{{ app.name }}</span>
        </button>
      </div>

      <!-- Universal apps -->
      <div v-if="universalApps.length" class="category">
        <div class="category-label">Universal</div>
        <button
          v-for="app in universalApps"
          :key="app.name"
          class="app-item"
          @click="launchApp(app)"
        >
          <span class="app-icon universal">⊕</span>
          <span class="app-name">{{ app.name }}</span>
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!visualApps.length && !workerApps.length && !nodeApps.length && !universalApps.length" class="menu-empty">
        No applications available.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { createStarkAPI, type StarkAPI } from '@stark-o/browser-runtime';
import { effectiveCapabilities } from '@stark-o/shared';

/* ── Types ── */

interface PackInfo {
  name: string;
  runtimeTag: 'node' | 'browser' | 'universal';
  grantedCapabilities: string[];
  metadata?: { requestedCapabilities?: string[] };
  description?: string;
}

type AppCategory = 'visual' | 'worker' | 'universal' | 'node';

interface AppEntry {
  name: string;
  category: AppCategory;
  pack: PackInfo;
}

/* ── State ── */

const loading = ref(true);
const errorMsg = ref('');
const apps = ref<AppEntry[]>([]);

/**
 * Create a StarkAPI instance.
 * The start-menu runs in a srcdoc iframe that shares the parent's origin,
 * so createStarkAPI() automatically picks up credentials from localStorage
 * and resolves the API URL from location.origin — no token relay needed.
 */
function getApi(): StarkAPI {
  return createStarkAPI();
}

/* ── Categorized lists (alphabetical) ── */

const visualApps = computed(() =>
  apps.value.filter((a) => a.category === 'visual').sort((a, b) => a.name.localeCompare(b.name)),
);
const workerApps = computed(() =>
  apps.value.filter((a) => a.category === 'worker').sort((a, b) => a.name.localeCompare(b.name)),
);
const nodeApps = computed(() =>
  apps.value.filter((a) => a.category === 'node').sort((a, b) => a.name.localeCompare(b.name)),
);
const universalApps = computed(() =>
  apps.value.filter((a) => a.category === 'universal').sort((a, b) => a.name.localeCompare(b.name)),
);

/* ── Helpers ── */

function categorize(pack: PackInfo): AppCategory {
  const caps = effectiveCapabilities(pack.metadata?.requestedCapabilities, pack.grantedCapabilities ?? []);
  // d. Universal apps: run on both browser and node runtimes
  if (pack.runtimeTag === 'universal') {
    return 'universal';
  }
  // a. Visual browser apps: have the root effective capability and browser runtime
  if (caps.includes('root') && pack.runtimeTag === 'browser') {
    return 'visual';
  }
  // b. Web worker browser apps: browser runtime without root
  if (pack.runtimeTag === 'browser') {
    return 'worker';
  }
  // c. Node.js apps
  return 'node';
}

/**
 * Signal the parent shell to hide the start menu.
 * Uses a DOM CustomEvent on the parent window (same origin via srcdoc).
 */
function requestHide(): void {
  try {
    window.parent?.dispatchEvent(new CustomEvent('stark:start-menu:hide'));
  } catch {
    /* cross-origin or no parent — ignore */
  }
}

/**
 * Read the current browser node ID from the pack execution context.
 * The executor sets __STARK_ENV__ on the parent window for main-thread packs.
 * STARK_NODE_ID is injected there by the pack executor.
 */
function getBrowserNodeId(): string | null {
  try {
    const env = (window.parent as Record<string, unknown>).__STARK_ENV__ as
      Record<string, string> | undefined;
    return env?.STARK_NODE_ID ?? null;
  } catch {
    return null;
  }
}

/* ── Load packs from API ── */

async function loadPacks() {
  loading.value = true;
  errorMsg.value = '';

  try {
    const api = getApi();
    const result = (await api.pack.list()) as { packs: PackInfo[] };
    const packs: PackInfo[] = result.packs ?? [];

    apps.value = packs.map((p) => ({
      name: p.name,
      category: categorize(p),
      pack: p,
    }));
  } catch (err: unknown) {
    console.error('Failed to load packs:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load applications';
  } finally {
    loading.value = false;
  }
}

/* ── Launch an app ── */

async function launchApp(app: AppEntry) {
  try {
    const api = getApi();

    if (app.category === 'node') {
      // Node apps need a Node.js node — find first available online node
      const nodeResult = (await api.node.list()) as { nodes: Array<{ id: string; name: string; runtimeType: string; status: string }> };
      const nodes = nodeResult.nodes ?? [];
      const nodeNode = nodes.find(
        (n) => n.runtimeType === 'node' && n.status === 'online',
      );

      if (!nodeNode) {
        alert('No Node.js runtime available. Please ensure a Node.js node is online.');
        return;
      }

      await api.pod.create(app.pack.name, { nodeId: nodeNode.id });
    } else {
      // Browser, universal, visual, and worker apps — target this browser node
      const browserNodeId = getBrowserNodeId();
      if (browserNodeId) {
        await api.pod.create(app.pack.name, { nodeId: browserNodeId });
      } else {
        await api.pod.create(app.pack.name);
      }
    }

    // Hide the start menu after launching
    requestHide();
  } catch (err: unknown) {
    console.error('Failed to launch app:', err);
    alert(`Failed to launch ${app.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Re-query packs when the shell opens the start-menu panel.
 * Listens for 'start-menu:opened' messages pushed by the executor
 * via the standardised onMessage / sendMessage API.
 */

/** Register with the standardised onMessage API from the pack context */
function registerOnMessage(): void {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { onMessage?: (handler: (msg: { type: string; payload?: unknown }) => void) => void } | undefined;
    if (ctx?.onMessage) {
      ctx.onMessage((msg) => {
        if (msg.type === 'start-menu:opened') {
          loadPacks();
        }
      });
    }
  } catch {
    /* cross-origin or no parent — ignore */
  }
}

onMounted(() => {
  loadPacks();
  registerOnMessage();
});
</script>

<style scoped>
.start-menu {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgba(59, 130, 246, 0.2);
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0 0 8px 0;
}

/* ── Header ── */
.menu-header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.menu-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── Loading ── */
.menu-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 18px;
  color: #64748b;
  font-size: 0.85rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Error ── */
.menu-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 18px;
  color: #f87171;
  font-size: 0.85rem;
  text-align: center;
}

.retry-btn {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  padding: 6px 18px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}
.retry-btn:hover {
  background: rgba(59, 130, 246, 0.25);
}

/* ── Body (scrollable app list) ── */
.menu-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}

.menu-body::-webkit-scrollbar {
  width: 4px;
}
.menu-body::-webkit-scrollbar-track {
  background: transparent;
}
.menu-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* ── Category ── */
.category {
  margin-bottom: 4px;
}

.category-label {
  padding: 8px 18px 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── App item ── */
.app-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 18px;
  background: transparent;
  border: none;
  color: #cbd5e1;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-align: left;
}
.app-item:hover {
  background: rgba(59, 130, 246, 0.12);
  color: #f1f5f9;
}
.app-item:active {
  background: rgba(59, 130, 246, 0.2);
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.app-icon.visual {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}
.app-icon.worker {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}
.app-icon.node {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.app-icon.universal {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.app-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ── Empty ── */
.menu-empty {
  padding: 40px 18px;
  text-align: center;
  color: #64748b;
  font-size: 0.85rem;
}
</style>
