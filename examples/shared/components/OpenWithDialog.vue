<template>
  <div v-if="visible" class="ow-overlay" @click.self="cancel">
    <div class="ow-dialog">
      <!-- Header -->
      <div class="ow-header">
        <span class="ow-title">Open With</span>
        <span v-if="refreshingApps" class="ow-header-spinner" title="Refreshing…" />
        <button class="ow-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Description -->
      <div class="ow-desc">
        <template v-if="filenames.length === 1">
          Choose an application to open <strong>{{ filenames[0] }}</strong>
        </template>
        <template v-else>
          Choose an application to open <strong>{{ filenames.length }} files</strong>
        </template>
      </div>

      <!-- Search -->
      <div class="ow-search-row">
        <input
          v-model="searchQuery"
          class="ow-search-box"
          type="text"
          placeholder="Search applications…"
        />
      </div>

      <!-- App list -->
      <div class="ow-list">
        <!-- Dynamic service picker overlay -->
        <template v-if="servicePickerApp">
          <div class="ow-service-picker-header">
            <button class="ow-service-back" @click="servicePickerBack">← Back</button>
            <span class="ow-service-title">Select service for {{ servicePickerApp.name }}</span>
          </div>
          <div v-if="dynamicServicesLoading" class="ow-loading">Loading services…</div>
          <div v-else-if="dynamicServices.length === 0" class="ow-empty">
            No dynamic services available for this pack.
          </div>
          <div v-else class="ow-category">
            <div
              v-for="svc in dynamicServices"
              :key="svc.id"
              class="ow-item"
              @click="launchWithService(servicePickerApp, svc)"
            >
              <span class="ow-item-icon service">⚡</span>
              <span class="ow-item-name">{{ svc.name }}</span>
              <span class="ow-item-desc">{{ svc.namespace }}</span>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="loading && displayGroups.length === 0" class="ow-loading">Loading applications…</div>
          <template v-else-if="displayGroups.length > 0">
            <div v-for="group in displayGroups" :key="group.category" class="ow-category">
              <div class="ow-category-label">{{ group.label }}</div>
              <div
                v-for="app in group.apps"
                :key="app.name"
                class="ow-item"
                :class="{ 'ow-selected': selectedPack === app.name }"
                @click="selectedPack = app.name"
                @dblclick="openWith(app.name, false)"
              >
                <span class="ow-item-icon" :class="app.category">{{ iconFor(app.category) }}</span>
                <span class="ow-item-name">{{ app.name }}</span>
                <span v-if="app.pack.description" class="ow-item-desc">{{ app.pack.description }}</span>
              </div>
            </div>
          </template>
          <div v-else class="ow-empty">
            No compatible applications found.
          </div>
        </template>
      </div>

      <!-- Actions -->
      <div class="ow-actions">
        <button class="ow-btn ow-btn-cancel" @click="cancel">Cancel</button>
        <button
          class="ow-btn ow-btn-once"
          :disabled="!selectedPack"
          @click="confirmOnce"
        >Just Once</button>
        <button
          v-if="singleExtension"
          class="ow-btn ow-btn-always"
          :disabled="!selectedPack"
          title="Set as default for this file type"
          @click="confirmAlways"
        >Always</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { createStarkAPI } from '@stark-o/browser-runtime';
import { commonExtension } from '../utils/lib/intents';
import {
  buildAppEntries,
  browserOnlyApps,
  searchApps,
  appsByCategory,
  categoryIcon,
  hasServiceLabel,
  fetchPacks,
  fetchDynamicServicesForPack,
  readPackCache,
  writePackCache,
  buildLabelGroups,
  getBrowserNodeId,
  type AppEntry,
  type AppCategory,
  type PackEntry,
  type DynamicServiceItem,
} from '../utils/lib/packs';

/* ── Props ── */

const props = withDefaults(defineProps<{
  /** Whether the dialog is visible. */
  visible?: boolean;
  /** The filenames to open (used for display and extension detection). */
  filenames?: string[];
  /** Available packs (pre-filtered or full list) — legacy prop kept for compat. */
  packs?: PackEntry[];
  /** Whether the pack list is still loading — legacy prop. */
  loading?: boolean;
}>(), {
  visible: false,
  filenames: () => [],
  packs: () => [],
  loading: false,
});

/* ── Emits ── */

const emit = defineEmits<{
  (e: 'select', packName: string, setDefault: boolean): void;
  (e: 'cancel'): void;
  (e: 'update:visible', val: boolean): void;
}>();

/* ── State ── */

const selectedPack = ref('');
const searchQuery = ref('');

/** Internally-loaded apps (from cache + API). */
const internalApps = ref<AppEntry[]>([]);
const refreshingApps = ref(false);

/** Dynamic service picker */
const servicePickerApp = ref<AppEntry | null>(null);
const dynamicServices = ref<DynamicServiceItem[]>([]);
const dynamicServicesLoading = ref(false);

/* ── Computed ── */

const singleExtension = computed(() => commonExtension(props.filenames));

/** Merge legacy `packs` prop with internally loaded apps. */
const resolvedApps = computed<AppEntry[]>(() => {
  if (internalApps.value.length > 0) return internalApps.value;
  // Fallback: build entries from legacy prop
  if (props.packs.length > 0) return browserOnlyApps(buildAppEntries(props.packs));
  return [];
});

/** Apply browser-only filter, then search query, then group by category. */
const displayGroups = computed(() => {
  const browserApps = browserOnlyApps(resolvedApps.value);
  const filtered = searchApps(browserApps, searchQuery.value);
  return appsByCategory(filtered);
});

/* ── Watchers ── */

watch(() => props.visible, (val) => {
  if (val) {
    selectedPack.value = '';
    searchQuery.value = '';
    servicePickerApp.value = null;
    dynamicServices.value = [];
    loadApps();
  }
});

/* ── Load with cache ── */

async function loadApps(): Promise<void> {
  // 1. Try cache
  try {
    const cached = await readPackCache();
    if (cached && cached.apps.length > 0) {
      internalApps.value = cached.apps;
    }
  } catch { /* ignore */ }

  // 2. Refresh from API
  refreshingApps.value = true;
  try {
    const packs = await fetchPacks();
    const apps = buildAppEntries(packs);
    internalApps.value = apps;
    writePackCache({ apps, labelGroups: buildLabelGroups(apps), timestamp: Date.now() });
  } catch {
    /* keep showing cached / legacy data */
  } finally {
    refreshingApps.value = false;
  }
}

/* ── Helpers ── */

function iconFor(cat: AppCategory): string {
  return categoryIcon(cat);
}

/* ── Handlers ── */

function cancel(): void {
  servicePickerApp.value = null;
  dynamicServices.value = [];
  emit('cancel');
  emit('update:visible', false);
}

function openWith(packName: string, setDefault: boolean): void {
  emit('select', packName, setDefault);
  emit('update:visible', false);
}

/** Attempt a service-aware launch. Returns true if handled via service flow. */
async function tryServiceLaunch(app: AppEntry, setDefault: boolean): Promise<boolean> {
  if (!hasServiceLabel(app.pack) || !app.pack.id) return false;

  dynamicServicesLoading.value = true;
  servicePickerApp.value = app;
  dynamicServices.value = [];

  const svcs = await fetchDynamicServicesForPack(app.pack.id);
  dynamicServicesLoading.value = false;

  if (svcs.length === 1) {
    // Single dynamic service — launch directly
    servicePickerApp.value = null;
    await launchWithService(app, svcs[0]);
    if (setDefault) emit('select', app.name, true);
    return true;
  } else if (svcs.length > 1) {
    // Multiple dynamic services — show picker
    dynamicServices.value = svcs;
    return true;
  }

  // No dynamic services found — fall through to normal open-with
  servicePickerApp.value = null;
  return false;
}

async function launchWithService(app: AppEntry, svc: DynamicServiceItem): Promise<void> {
  servicePickerApp.value = null;
  dynamicServices.value = [];

  try {
    const api = createStarkAPI();
    const browserNodeId = getBrowserNodeId();
    const opts: Record<string, unknown> = { serviceId: svc.id };
    if (browserNodeId) opts.nodeId = browserNodeId;
    await api.pod.create(app.pack.name, opts);
    emit('update:visible', false);
  } catch (err: unknown) {
    console.error(`Failed to launch ${app.pack.name} with service ${svc.name}:`, err);
  }
}

function servicePickerBack(): void {
  servicePickerApp.value = null;
  dynamicServices.value = [];
}

async function confirmOnce(): Promise<void> {
  if (!selectedPack.value) return;
  const app = resolvedApps.value.find((a) => a.name === selectedPack.value);
  if (app && await tryServiceLaunch(app, false)) return;
  openWith(selectedPack.value, false);
}

async function confirmAlways(): Promise<void> {
  if (!selectedPack.value) return;
  const app = resolvedApps.value.find((a) => a.name === selectedPack.value);
  if (app && await tryServiceLaunch(app, true)) return;
  openWith(selectedPack.value, true);
}
</script>

<style scoped>
.ow-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.ow-dialog {
  width: 420px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* Header */
.ow-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ow-title {
  font-size: 0.95rem;
  font-weight: 600;
  flex: 1;
}

.ow-header-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: ow-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes ow-spin {
  to { transform: rotate(360deg); }
}

.ow-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.ow-close-btn:hover {
  color: #e2e8f0;
}

/* Description */
.ow-desc {
  padding: 10px 16px 4px;
  font-size: 0.82rem;
  color: #94a3b8;
  flex-shrink: 0;
}
.ow-desc strong {
  color: #cbd5e1;
}

/* Search */
.ow-search-row {
  padding: 6px 16px 6px;
  flex-shrink: 0;
}

.ow-search-box {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  outline: none;
  box-sizing: border-box;
}
.ow-search-box::placeholder { color: #64748b; }
.ow-search-box:focus { border-color: rgba(59, 130, 246, 0.5); }

/* List */
.ow-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px;
}

.ow-list::-webkit-scrollbar {
  width: 6px;
}
.ow-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.ow-category { margin-bottom: 4px; }

.ow-category-label {
  padding: 6px 10px 2px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ow-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.ow-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.ow-item.ow-selected {
  background: rgba(59, 130, 246, 0.2);
}

.ow-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.ow-item-icon.visual {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}
.ow-item-icon.universal {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}
.ow-item-icon.worker {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}
.ow-item-icon.node {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.ow-item-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
}

.ow-item-desc {
  flex: 1;
  font-size: 0.75rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ow-loading,
.ow-empty {
  padding: 24px 16px;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
}

/* Service Picker */
.ow-service-picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ow-service-back {
  background: none;
  border: none;
  color: #60a5fa;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 4px 0;
}
.ow-service-back:hover { text-decoration: underline; }

.ow-service-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ow-item-icon.service {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

/* Actions */
.ow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ow-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.12s;
}

.ow-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}
.ow-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.ow-btn-once {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}
.ow-btn-once:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}
.ow-btn-once:disabled {
  opacity: 0.4;
  cursor: default;
}

.ow-btn-always {
  background: #3b82f6;
  color: #fff;
}
.ow-btn-always:hover:not(:disabled) {
  background: #2563eb;
}
.ow-btn-always:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
