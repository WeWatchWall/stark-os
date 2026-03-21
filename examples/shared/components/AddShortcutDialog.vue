<template>
  <div v-if="visible" class="sc-overlay" @click.self="cancel">
    <div class="sc-dialog">
      <!-- Header -->
      <div class="sc-header">
        <span class="sc-title">Add Shortcut</span>
        <span v-if="refreshingApps" class="sc-header-spinner" title="Refreshing…" />
        <button class="sc-close-btn" title="Close" @click="cancel">&times;</button>
      </div>

      <!-- Pack selection -->
      <div class="sc-section-label">Select a Pack</div>
      <div class="sc-search-row">
        <input
          v-model="searchQuery"
          class="sc-search-box"
          type="text"
          placeholder="Search packs…"
        />
      </div>
      <div class="sc-pack-list">
        <div v-if="displayGroups.length === 0 && !refreshingApps" class="sc-empty">
          No packs found.
        </div>
        <div v-for="group in displayGroups" :key="group.category" class="sc-category">
          <div class="sc-category-label">{{ group.label }}</div>
          <div
            v-for="app in group.apps"
            :key="app.name"
            class="sc-item"
            :class="{ 'sc-selected': selectedPack === app.name }"
            @click="selectPack(app)"
          >
            <span class="sc-item-icon" :class="app.category">{{ iconFor(app.category) }}</span>
            <span class="sc-item-name">{{ app.name }}</span>
            <span v-if="app.pack.description" class="sc-item-desc">{{ app.pack.description }}</span>
          </div>
        </div>
      </div>

      <!-- Filename -->
      <div class="sc-section-label">Shortcut File Name</div>
      <div class="sc-field-row">
        <input v-model="fileName" class="sc-input" type="text" placeholder="shortcut.lnk" />
      </div>

      <!-- Arguments -->
      <div class="sc-section-label">Arguments</div>
      <div class="sc-args-list">
        <div v-for="(arg, i) in args" :key="i" class="sc-arg-row">
          <input
            v-model="args[i]"
            class="sc-input sc-arg-input"
            type="text"
            placeholder="argument"
          />
          <button class="sc-arg-remove" title="Remove" @click="removeArg(i)">&times;</button>
        </div>
        <button class="sc-arg-add" @click="addArg">+ Add Argument</button>
      </div>

      <!-- Icon section -->
      <div class="sc-section-label">Icon</div>
      <div class="sc-icon-info">
        Get free icons at <a href="https://icons8.com/icons" target="_blank" rel="noopener noreferrer">icons8.com/icons</a>
      </div>
      <div class="sc-icon-row">
        <div class="sc-icon-inputs">
          <input
            v-model="iconUrl"
            class="sc-input"
            type="text"
            placeholder="Paste icon URL…"
            @input="onIconUrlChange"
          />
          <div class="sc-icon-or">or</div>
          <label class="sc-upload-btn">
            Upload Icon
            <input
              ref="iconFileInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="onIconUpload"
            />
          </label>
        </div>
        <div class="sc-icon-preview">
          <img v-if="iconPreviewSrc" :src="iconPreviewSrc" alt="Icon preview" class="sc-icon-img" />
          <span v-else class="sc-icon-placeholder">No icon</span>
        </div>
      </div>
      <div v-if="iconError" class="sc-icon-error">{{ iconError }}</div>

      <!-- Actions -->
      <div class="sc-actions">
        <button class="sc-btn sc-btn-cancel" @click="cancel">Cancel</button>
        <button
          class="sc-btn sc-btn-ok"
          :disabled="!canConfirm"
          @click="confirm"
        >OK</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  buildAppEntries,
  appsByCategory,
  categoryIcon,
  extractVolumeMounts,
  hasServiceLabel,
  fetchPacks,
  fetchDynamicServicesForPack,
  readPackCache,
  writePackCache,
  buildLabelGroups,
  searchApps,
  type AppEntry,
  type AppCategory,
} from '../utils/lib/packs';
import type { ShortcutData } from '../utils/lib/intents';
import {
  getStarkOpfsRoot,
  getDirectoryHandle,
  getFileHandle,
} from '../utils/lib/opfs';

/* ── Props ── */

const props = withDefaults(defineProps<{
  /** Whether the dialog is visible. */
  visible?: boolean;
  /** Target directory path where the shortcut will be saved. */
  targetDir?: string;
}>(), {
  visible: false,
  targetDir: '/home/desktop',
});

/* ── Emits ── */

const emit = defineEmits<{
  (e: 'created', filePath: string): void;
  (e: 'cancel'): void;
  (e: 'update:visible', val: boolean): void;
}>();

/* ── State ── */

const searchQuery = ref('');
const selectedPack = ref('');
const selectedApp = ref<AppEntry | null>(null);
const fileName = ref('');
const args = ref<string[]>(['']);
const iconUrl = ref('');
const iconBase64 = ref('');
const iconPreviewSrc = ref('');
const iconError = ref('');
const refreshingApps = ref(false);
const internalApps = ref<AppEntry[]>([]);
const iconFileInput = ref<HTMLInputElement | null>(null);

/* ── Computed ── */

const displayGroups = computed(() => {
  const filtered = searchApps(internalApps.value, searchQuery.value);
  return appsByCategory(filtered);
});

const canConfirm = computed(() => {
  return selectedPack.value && fileName.value.trim().length > 0;
});

/* ── Watchers ── */

watch(() => props.visible, (val) => {
  if (val) {
    searchQuery.value = '';
    selectedPack.value = '';
    selectedApp.value = null;
    fileName.value = '';
    args.value = [''];
    iconUrl.value = '';
    iconBase64.value = '';
    iconPreviewSrc.value = '';
    iconError.value = '';
    loadApps();
  }
});

/* ── Load packs with cache ── */

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
    /* keep showing cached data */
  } finally {
    refreshingApps.value = false;
  }
}

/* ── Helpers ── */

function iconFor(cat: AppCategory): string {
  return categoryIcon(cat);
}

function selectPack(app: AppEntry): void {
  selectedPack.value = app.name;
  selectedApp.value = app;
  // Auto-fill filename
  fileName.value = app.name + '.lnk';
}

function addArg(): void {
  args.value.push('');
}

function removeArg(i: number): void {
  args.value.splice(i, 1);
}

function onIconUrlChange(): void {
  iconBase64.value = '';
  iconError.value = '';
  if (iconUrl.value.trim()) {
    iconPreviewSrc.value = iconUrl.value.trim();
  } else {
    iconPreviewSrc.value = '';
  }
}

function onIconUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    iconBase64.value = result;
    iconPreviewSrc.value = result;
    iconUrl.value = '';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

/* ── Actions ── */

function cancel(): void {
  emit('cancel');
  emit('update:visible', false);
}

async function confirm(): Promise<void> {
  if (!canConfirm.value || !selectedApp.value) return;

  const pack = selectedApp.value.pack;
  const vols = extractVolumeMounts(pack);

  // If icon is a URL, fetch and convert to base64
  let finalIconBase64 = iconBase64.value;
  if (!finalIconBase64 && iconUrl.value.trim()) {
    try {
      const resp = await fetch(iconUrl.value.trim());
      const blob = await resp.blob();
      finalIconBase64 = await blobToDataUrl(blob);
    } catch {
      iconError.value = 'Failed to fetch icon from URL. The shortcut will be saved without an icon.';
    }
  }

  const shortcutData: ShortcutData = {
    packName: pack.name,
    runtimeTag: pack.runtimeTag,
    description: pack.description,
    args: args.value.filter((a) => a.trim().length > 0),
    iconBase64: finalIconBase64 || undefined,
    packId: pack.id,
    labels: pack.metadata?.labels?.length ? pack.metadata.labels : undefined,
    volumeMounts: vols.length > 0 ? vols : undefined,
  };

  // Check if pack has a service label and resolve dynamic service
  if (hasServiceLabel(pack) && pack.id) {
    try {
      const svcs = await fetchDynamicServicesForPack(pack.id);
      if (svcs.length === 1) {
        shortcutData.serviceId = svcs[0].id;
      }
    } catch { /* no service */ }
  }

  // Write the .lnk file to OPFS
  const fName = fileName.value.trim().endsWith('.lnk')
    ? fileName.value.trim()
    : fileName.value.trim() + '.lnk';

  try {
    const root = await getStarkOpfsRoot();
    if (!root) return;

    await getDirectoryHandle(root, props.targetDir, true);
    const filePath = props.targetDir.replace(/\/+$/, '') + '/' + fName;
    const fh = await getFileHandle(root, filePath, true);
    const writable = await fh.createWritable();
    await writable.write(new TextEncoder().encode(JSON.stringify(shortcutData, null, 2)));
    await writable.close();

    emit('created', filePath);
    emit('update:visible', false);
  } catch (err) {
    console.error('AddShortcutDialog: failed to write shortcut:', err);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
</script>

<style scoped>
.sc-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.sc-dialog {
  width: 480px;
  max-width: 95vw;
  max-height: 85vh;
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
.sc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.sc-title {
  font-size: 0.95rem;
  font-weight: 600;
  flex: 1;
}
.sc-header-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: sc-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes sc-spin {
  to { transform: rotate(360deg); }
}
.sc-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.sc-close-btn:hover { color: #e2e8f0; }

/* Section labels */
.sc-section-label {
  padding: 8px 16px 2px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Search */
.sc-search-row {
  padding: 4px 16px 4px;
  flex-shrink: 0;
}
.sc-search-box {
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
.sc-search-box::placeholder { color: #64748b; }
.sc-search-box:focus { border-color: rgba(59, 130, 246, 0.5); }

/* Pack list */
.sc-pack-list {
  flex: 0 1 180px;
  min-height: 80px;
  overflow-y: auto;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.sc-pack-list::-webkit-scrollbar { width: 6px; }
.sc-pack-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.sc-category { margin-bottom: 4px; }
.sc-category-label {
  padding: 4px 10px 2px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.sc-item:hover { background: rgba(255, 255, 255, 0.06); }
.sc-item.sc-selected { background: rgba(59, 130, 246, 0.2); }
.sc-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  font-size: 0.8rem;
  flex-shrink: 0;
}
.sc-item-icon.visual { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.sc-item-icon.universal { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.sc-item-icon.worker { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
.sc-item-icon.node { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.sc-item-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
}
.sc-item-desc {
  flex: 1;
  font-size: 0.72rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.sc-empty {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
}

/* Field row */
.sc-field-row {
  padding: 4px 16px 6px;
  flex-shrink: 0;
}
.sc-input {
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
.sc-input::placeholder { color: #64748b; }
.sc-input:focus { border-color: rgba(59, 130, 246, 0.5); }

/* Arguments */
.sc-args-list {
  padding: 4px 16px 6px;
  max-height: 100px;
  overflow-y: auto;
  flex-shrink: 0;
}
.sc-args-list::-webkit-scrollbar { width: 6px; }
.sc-args-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.sc-arg-row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.sc-arg-input { flex: 1; }
.sc-arg-remove {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.sc-arg-remove:hover { color: #ef4444; }
.sc-arg-add {
  background: none;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #64748b;
  font-size: 0.75rem;
  padding: 4px 8px;
  cursor: pointer;
  width: 100%;
  text-align: center;
}
.sc-arg-add:hover { border-color: rgba(59, 130, 246, 0.4); color: #94a3b8; }

/* Icon section */
.sc-icon-info {
  padding: 2px 16px 4px;
  font-size: 0.72rem;
  color: #64748b;
  flex-shrink: 0;
}
.sc-icon-info a {
  color: #60a5fa;
  text-decoration: none;
}
.sc-icon-info a:hover { text-decoration: underline; }

.sc-icon-row {
  display: flex;
  gap: 12px;
  padding: 4px 16px 8px;
  flex-shrink: 0;
}
.sc-icon-inputs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sc-icon-or {
  font-size: 0.72rem;
  color: #64748b;
  text-align: center;
}
.sc-upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 12px;
  color: #94a3b8;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.12s;
}
.sc-upload-btn:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }

.sc-icon-preview {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sc-icon-img {
  max-width: 56px;
  max-height: 56px;
  object-fit: contain;
}
.sc-icon-placeholder {
  font-size: 0.65rem;
  color: #475569;
}
.sc-icon-error {
  padding: 2px 16px 4px;
  font-size: 0.72rem;
  color: #f87171;
  flex-shrink: 0;
}

/* Actions */
.sc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.sc-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.12s;
}
.sc-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}
.sc-btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }
.sc-btn-ok {
  background: #3b82f6;
  color: #fff;
}
.sc-btn-ok:hover:not(:disabled) { background: #2563eb; }
.sc-btn-ok:disabled { opacity: 0.4; cursor: default; }
</style>
