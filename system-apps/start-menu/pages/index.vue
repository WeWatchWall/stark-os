<template>
  <div class="start-menu" @click.stop>
    <!-- Header: clickable title / search box -->
    <div class="menu-header">
      <div v-if="!searchActive" class="menu-title-row" @click="activateSearch">
        <span class="menu-title">Applications</span>
        <span v-if="refreshing" class="header-spinner" title="Refreshing…" />
      </div>
      <div v-else class="search-row">
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="search-box"
          type="text"
          placeholder="Search applications…"
          @keydown.escape="deactivateSearch"
        />
        <button class="search-close" title="Close search" @click="deactivateSearch">&times;</button>
        <span v-if="refreshing" class="header-spinner" title="Refreshing…" />
      </div>
    </div>

    <!-- Toolbar: List / Back toggle -->
    <div v-if="!searchActive && !initialLoading && !servicePickerApp" class="menu-toolbar">
      <button v-if="viewMode === 'labels'" class="toolbar-btn" @click="viewMode = 'list'">☰ List</button>
      <button v-else class="toolbar-btn" @click="viewMode = 'labels'">← Back</button>
    </div>

    <!-- Initial loading (no cache yet) -->
    <div v-if="initialLoading" class="menu-loading">
      <span class="spinner" />
      <span>Loading apps…</span>
    </div>

    <!-- Error state (only when no data at all) -->
    <div v-else-if="errorMsg && allApps.length === 0" class="menu-error">
      <span>{{ errorMsg }}</span>
      <button class="retry-btn" @click="refresh">Retry</button>
    </div>

    <!-- Dynamic service picker overlay -->
    <div v-else-if="servicePickerApp" class="menu-body">
      <div class="service-picker-header">
        <button class="toolbar-btn" @click="servicePickerApp = null; dynamicServices = [];">← Back</button>
        <span class="service-picker-title">Select service for {{ servicePickerApp.name }}</span>
      </div>
      <div v-if="dynamicServicesLoading" class="menu-loading">
        <span class="spinner" />
        <span>Loading services…</span>
      </div>
      <div v-else-if="dynamicServices.length === 0" class="menu-empty">
        No dynamic services available for this pack.
      </div>
      <div v-else class="service-picker-list">
        <button
          v-for="svc in dynamicServices"
          :key="svc.id"
          class="app-item"
          @click="launchWithService(servicePickerApp, svc)"
        >
          <span class="app-icon service-icon">⚡</span>
          <span class="app-name">{{ svc.name }}</span>
          <span class="service-ns">{{ svc.namespace }}</span>
        </button>
      </div>
    </div>

    <!-- App list body -->
    <div v-else class="menu-body">
      <!-- ─── Search results ─── -->
      <template v-if="searchActive && trimmedSearch">
        <div v-for="group in searchCategoryGroups" :key="group.category" class="category">
          <div class="category-label">{{ group.label }}</div>
          <button
            v-for="app in group.apps"
            :key="app.name"
            class="app-item"
            @click="launchApp(app)"
          >
            <span class="app-icon" :class="app.category">{{ iconFor(app.category) }}</span>
            <span class="app-name">{{ app.name }}</span>
          </button>
        </div>
        <div v-if="searchResults.length === 0" class="menu-empty">No matching applications.</div>
      </template>

      <!-- ─── Label grouping view (default) ─── -->
      <template v-else-if="viewMode === 'labels'">
        <div v-for="group in labelGroups" :key="group.label" class="label-group">
          <button class="label-header" @click="toggleGroup(group.label)">
            <span class="label-chevron">{{ expandedGroups.has(group.label) ? '▾' : '▸' }}</span>
            <span class="label-name">{{ group.label }}</span>
            <span class="label-count">{{ group.apps.length }}</span>
          </button>
          <div v-if="expandedGroups.has(group.label)" class="label-apps">
            <button
              v-for="app in group.apps"
              :key="app.name"
              class="app-item"
              @click="launchApp(app)"
            >
              <span class="app-icon" :class="app.category">{{ iconFor(app.category) }}</span>
              <span class="app-name">{{ app.name }}</span>
            </button>
          </div>
        </div>
        <div v-if="labelGroups.length === 0" class="menu-empty">No applications available.</div>
      </template>

      <!-- ─── Flat category list view ─── -->
      <template v-else>
        <div v-for="group in categoryGroups" :key="group.category" class="category">
          <div class="category-label">{{ group.label }}</div>
          <button
            v-for="app in group.apps"
            :key="app.name"
            class="app-item"
            @click="launchApp(app)"
          >
            <span class="app-icon" :class="app.category">{{ iconFor(app.category) }}</span>
            <span class="app-name">{{ app.name }}</span>
          </button>
        </div>
        <div v-if="allApps.length === 0" class="menu-empty">No applications available.</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { createStarkAPI } from '@stark-o/browser-runtime';
import type { PackMessageHandler } from '@stark-o/shared';
import {
  buildAppEntries,
  buildLabelGroups,
  searchApps,
  appsByCategory,
  categoryIcon,
  hasServiceLabel,
  fetchPacks,
  readPackCache,
  writePackCache,
  getBrowserNodeId,
  type AppEntry,
  type AppCategory,
  type LabelGroup,
} from '../../../examples/shared/utils/lib/packs';

/* ── Types ── */

interface DynamicServiceItem {
  id: string;
  name: string;
  namespace: string;
  packId: string;
}

/* ── State ── */

const allApps = ref<AppEntry[]>([]);
const labelGroups = ref<LabelGroup[]>([]);
const initialLoading = ref(true);
const refreshing = ref(false);
const errorMsg = ref('');

/** 'labels' = label-grouping default, 'list' = flat category list */
const viewMode = ref<'labels' | 'list'>('labels');

/** Search */
const searchActive = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

/** Expanded label groups */
const expandedGroups = ref(new Set<string>());

/** Dynamic service picker */
const servicePickerApp = ref<AppEntry | null>(null);
const dynamicServices = ref<DynamicServiceItem[]>([]);
const dynamicServicesLoading = ref(false);

/* ── Computed ── */

const trimmedSearch = computed(() => searchQuery.value.trim());
const searchResults = computed(() => searchApps(allApps.value, searchQuery.value));
const searchCategoryGroups = computed(() => appsByCategory(searchResults.value));
const categoryGroups = computed(() => appsByCategory(allApps.value));

/* ── Helpers ── */

function iconFor(cat: AppCategory): string {
  return categoryIcon(cat);
}

function toggleGroup(label: string): void {
  if (expandedGroups.value.has(label)) {
    expandedGroups.value.delete(label);
  } else {
    expandedGroups.value.add(label);
  }
}

function activateSearch(): void {
  searchActive.value = true;
  searchQuery.value = '';
  nextTick(() => searchInput.value?.focus());
}

function deactivateSearch(): void {
  searchActive.value = false;
  searchQuery.value = '';
}

/* ── Shell interaction ── */

function requestHide(): void {
  try {
    window.parent?.dispatchEvent(new CustomEvent('stark:start-menu:hide'));
  } catch { /* cross-origin — ignore */ }
}

/* ── Data loading with cache ── */

async function refresh(): Promise<void> {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const packs = await fetchPacks();
    const apps = buildAppEntries(packs);
    const groups = buildLabelGroups(apps);

    allApps.value = apps;
    labelGroups.value = groups;

    // Persist cache
    writePackCache({ apps, labelGroups: groups, timestamp: Date.now() });
    errorMsg.value = '';
  } catch (err: unknown) {
    console.error('Failed to load packs:', err);
    // Only show error if we have no cached data to display
    if (allApps.value.length === 0) {
      errorMsg.value = err instanceof Error ? err.message : 'Failed to load applications';
    }
  } finally {
    refreshing.value = false;
    initialLoading.value = false;
  }
}

async function initLoad(): Promise<void> {
  // 1. Try to show cached data immediately
  try {
    const cached = await readPackCache();
    if (cached && cached.apps.length > 0) {
      allApps.value = cached.apps;
      labelGroups.value = cached.labelGroups;
      initialLoading.value = false;
    }
  } catch { /* ignore cache errors */ }

  // 2. Refresh from API
  await refresh();
}

/* ── Launch ── */

/**
 * Fetch dynamic services for a pack.
 * Returns services where mode === 'dynamic' and packId matches the given pack.
 */
async function fetchDynamicServicesForPack(packId: string): Promise<DynamicServiceItem[]> {
  try {
    const api = createStarkAPI();
    const data = await api.service.list({}) as { services?: Array<Record<string, unknown>> };
    const services = data.services ?? [];
    return services
      .filter((s) => s.mode === 'dynamic' && s.packId === packId)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name),
        namespace: String(s.namespace ?? 'default'),
        packId: String(s.packId),
      }));
  } catch {
    return [];
  }
}

async function launchApp(app: AppEntry): Promise<void> {
  // If the pack has the special "service" label, look up dynamic services
  if (hasServiceLabel(app.pack)) {
    dynamicServicesLoading.value = true;
    servicePickerApp.value = app;
    dynamicServices.value = [];

    const svcs = await fetchDynamicServicesForPack(app.pack.id);
    dynamicServicesLoading.value = false;

    if (svcs.length === 1) {
      // Single dynamic service — launch directly
      servicePickerApp.value = null;
      await launchWithService(app, svcs[0]);
      return;
    } else if (svcs.length > 1) {
      // Multiple dynamic services — show picker
      dynamicServices.value = svcs;
      return;
    }
    // No dynamic services found — fall through to normal launch
    servicePickerApp.value = null;
  }

  await launchAppDirect(app);
}

/**
 * Launch a pack under a specific dynamic service.
 */
async function launchWithService(app: AppEntry, svc: DynamicServiceItem): Promise<void> {
  servicePickerApp.value = null;
  dynamicServices.value = [];

  try {
    const api = createStarkAPI();
    const browserNodeId = getBrowserNodeId();
    const opts: Record<string, unknown> = { serviceId: svc.id };
    if (browserNodeId) opts.nodeId = browserNodeId;
    await api.pod.create(app.pack.name, opts);
    requestHide();
  } catch (err: unknown) {
    console.error('Failed to launch app with service:', err);
    alert(`Failed to launch ${app.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Normal launch path (no dynamic service).
 */
async function launchAppDirect(app: AppEntry): Promise<void> {
  try {
    const api = createStarkAPI();

    if (app.category === 'node') {
      const nodeResult = (await api.node.list()) as {
        nodes: Array<{ id: string; name: string; runtimeType: string; status: string }>;
      };
      const nodeNode = (nodeResult.nodes ?? []).find(
        (n) => n.runtimeType === 'node' && n.status === 'online',
      );
      if (!nodeNode) {
        alert('No Node.js runtime available. Please ensure a Node.js node is online.');
        return;
      }
      await api.pod.create(app.pack.name, { nodeId: nodeNode.id });
    } else {
      const browserNodeId = getBrowserNodeId();
      if (browserNodeId) {
        await api.pod.create(app.pack.name, { nodeId: browserNodeId });
      } else {
        await api.pod.create(app.pack.name);
      }
    }

    requestHide();
  } catch (err: unknown) {
    console.error('Failed to launch app:', err);
    alert(`Failed to launch ${app.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/* ── Message listener ── */

function registerOnMessage(): void {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { onMessage?: (handler: PackMessageHandler) => void } | undefined;
    if (ctx?.onMessage) {
      ctx.onMessage((msg) => {
        if (msg.type === 'start-menu:opened') {
          refresh();
        }
      });
    }
  } catch { /* cross-origin — ignore */ }
}

onMounted(() => {
  initLoad();
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
  padding: 12px 18px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.menu-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.menu-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.header-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-box {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  outline: none;
}
.search-box::placeholder { color: #64748b; }
.search-box:focus { border-color: rgba(59, 130, 246, 0.5); }

.search-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}
.search-close:hover { color: #e2e8f0; }

/* ── Toolbar ── */
.menu-toolbar {
  display: flex;
  padding: 4px 18px;
  flex-shrink: 0;
}

.toolbar-btn {
  background: none;
  border: none;
  color: #60a5fa;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 4px 0;
}
.toolbar-btn:hover { text-decoration: underline; }

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
.retry-btn:hover { background: rgba(59, 130, 246, 0.25); }

/* ── Body (scrollable app list) ── */
.menu-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}

.menu-body::-webkit-scrollbar { width: 4px; }
.menu-body::-webkit-scrollbar-track { background: transparent; }
.menu-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* ── Category ── */
.category { margin-bottom: 4px; }

.category-label {
  padding: 8px 18px 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── Label group ── */
.label-group { margin-bottom: 2px; }

.label-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 18px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.label-header:hover { background: rgba(255, 255, 255, 0.04); }

.label-chevron {
  font-size: 0.75rem;
  width: 12px;
  text-align: center;
}

.label-name { flex: 1; }

.label-count {
  font-size: 0.65rem;
  color: #64748b;
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 8px;
}

.label-apps { padding-left: 0; }

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
  flex-shrink: 0;
}
.app-item:hover {
  background: rgba(59, 130, 246, 0.12);
  color: #f1f5f9;
}
.app-item:active { background: rgba(59, 130, 246, 0.2); }

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

/* ── Service Picker ── */
.service-picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.service-picker-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.service-icon {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.service-ns {
  margin-left: auto;
  font-size: 0.7rem;
  color: #64748b;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}
</style>
