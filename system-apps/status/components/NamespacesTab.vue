<template>
  <div class="namespaces-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading namespaces…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Main content -->
    <template v-else-if="hasData">
      <!-- Root namespace banner -->
      <div class="root-banner">
        <span class="root-icon">🏠</span>
        <span class="root-label">Root Namespace:</span>
        <Tag :value="rootNamespace" severity="info" />
        <span v-if="isAdmin" class="root-hint">(admin — cluster-wide default)</span>
        <span v-else class="root-hint">(personal — derived from {{ username }})</span>
      </div>

      <!-- Create namespace form -->
      <div class="create-form">
        <div class="form-title">Create Namespace</div>
        <div class="form-row">
          <div class="ns-input-group">
            <span v-if="!isAdmin" class="ns-prefix">{{ rootNamespace }}/</span>
            <input v-model="newNamespaceSuffix" :placeholder="isAdmin ? 'namespace-name' : 'sub-namespace'" class="form-input" />
          </div>
          <Button
            icon="pi pi-plus"
            label="Create"
            severity="success"
            size="small"
            :loading="creating"
            @click="createNamespace"
            :disabled="!newNamespaceSuffix"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="allRows.length === 0" class="state-msg">
        No namespaces found. Create one above.
      </div>

      <!-- Namespaces table -->
      <DataTable
        v-else
        :value="allRows"
        scrollable
        scrollHeight="flex"
        :rowHover="true"
        stripedRows
        class="namespaces-table"
      >
        <Column field="name" header="Name" sortable style="min-width: 160px">
          <template #body="{ data }">
            <div class="ns-name-cell">
              <span class="ns-name-icon">📁</span>
              <span class="ns-name-text">{{ data.name }}</span>
              <Tag v-if="data.isRoot" value="root" severity="warn" class="root-tag" />
              <Tag v-if="data.isReserved" value="reserved" severity="secondary" class="reserved-tag" />
            </div>
          </template>
        </Column>
        <Column field="phase" header="Phase" sortable style="min-width: 90px">
          <template #body="{ data }">
            <Tag :value="data.phase" :severity="phaseSeverity(data.phase)" />
          </template>
        </Column>
        <Column field="podCount" header="Pods" sortable class="hide-on-mobile" style="min-width: 60px" />
        <Column field="cpuUsage" header="CPU (m)" sortable class="hide-on-mobile" style="min-width: 70px">
          <template #body="{ data }">
            <span>{{ data.cpuUsage ?? '—' }}</span>
            <span v-if="data.cpuQuota" class="quota-hint"> / {{ data.cpuQuota }}</span>
          </template>
        </Column>
        <Column field="memoryUsage" header="Mem (MB)" sortable class="hide-on-mobile" style="min-width: 80px">
          <template #body="{ data }">
            <span>{{ data.memoryUsage ?? '—' }}</span>
            <span v-if="data.memoryQuota" class="quota-hint"> / {{ data.memoryQuota }}</span>
          </template>
        </Column>
        <Column field="hasQuota" header="Quota" sortable class="hide-on-mobile" style="min-width: 60px">
          <template #body="{ data }">
            <Tag :value="data.hasQuota ? 'Yes' : 'No'" :severity="data.hasQuota ? 'success' : 'secondary'" />
          </template>
        </Column>
        <Column header="Actions" style="min-width: 100px">
          <template #body="{ data }">
            <div class="action-btns">
              <Button
                icon="pi pi-pencil"
                severity="info"
                size="small"
                text
                :disabled="data.isReserved"
                @click="openEditDialog(data)"
                title="Edit namespace"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                :disabled="data.isReserved"
                :loading="deletingNamespaces.has(data.name)"
                @click="deleteNamespace(data.id, data.name)"
                title="Delete namespace"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </template>

    <!-- Edit namespace dialog -->
    <div v-if="editDialog.show" class="dialog-overlay" @click.self="editDialog.show = false">
      <div class="dialog-box" @click.stop>
        <div class="dialog-header">
          <span class="dialog-title">Edit Namespace — "{{ editDialog.name }}"</span>
          <button class="dialog-close" @click="editDialog.show = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="dialog-section-title">Resource Quota</div>
          <div class="dialog-field-row">
            <div class="dialog-field">
              <label class="dialog-label">Max Pods</label>
              <input v-model.number="editDialog.maxPods" type="number" min="0" class="dialog-input" placeholder="—" />
            </div>
            <div class="dialog-field">
              <label class="dialog-label">Max CPU (millicores)</label>
              <input v-model.number="editDialog.maxCpu" type="number" min="0" class="dialog-input" placeholder="—" />
            </div>
          </div>
          <div class="dialog-field-row">
            <div class="dialog-field">
              <label class="dialog-label">Max Memory (MB)</label>
              <input v-model.number="editDialog.maxMemory" type="number" min="0" class="dialog-input" placeholder="—" />
            </div>
            <div class="dialog-field">
              <label class="dialog-label">Max Storage (MB)</label>
              <input v-model.number="editDialog.maxStorage" type="number" min="0" class="dialog-input" placeholder="—" />
            </div>
          </div>
          <div class="dialog-section-title">Labels</div>
          <div class="dialog-field">
            <label class="dialog-label">Labels (key=value, one per line)</label>
            <textarea v-model="editDialog.labelsText" rows="3" class="dialog-textarea" placeholder="team=backend&#10;env=production"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" text @click="editDialog.show = false" />
          <Button label="Save" severity="success" size="small" :loading="editDialog.saving" @click="saveEdit" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

const RESERVED_NAMES = ['default', 'stark-system', 'stark-public'];

interface NamespaceData {
  id: string;
  name: string;
  phase: string;
  labels: Record<string, string>;
  resourceUsage: {
    pods?: number;
    cpu?: number;
    memory?: number;
    storage?: number;
  };
  hasQuota: boolean;
  resourceQuota?: {
    hard?: {
      pods?: number;
      cpu?: number;
      memory?: number;
      storage?: number;
    };
  };
  createdAt: string;
}

interface NamespaceRow {
  id: string;
  name: string;
  phase: string;
  podCount: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  cpuQuota: number | null;
  memoryQuota: number | null;
  hasQuota: boolean;
  isRoot: boolean;
  isReserved: boolean;
  labels: Record<string, string>;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const creating = ref(false);
const allRows = ref<NamespaceRow[]>([]);
const deletingNamespaces = ref<Set<string>>(new Set());
const newNamespaceSuffix = ref('');
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const editDialog = reactive({
  show: false,
  saving: false,
  id: '',
  name: '',
  maxPods: null as number | null,
  maxCpu: null as number | null,
  maxMemory: null as number | null,
  maxStorage: null as number | null,
  labelsText: '',
});

const api = useStarkApi();
const toast = useToast();

/* ── User context ── */

const userInfo = ref<{ email: string; userId: string; username?: string; roles?: string[] } | null>(null);
const isAdmin = computed(() => userInfo.value?.roles?.includes('admin') ?? false);
const username = computed(() => userInfo.value?.username ?? '');
const rootNamespace = computed(() => {
  if (isAdmin.value) return 'default';
  if (!username.value) return 'default';
  // Derive user namespace: lowercase, non-alphanum → hyphen, collapse, strip edges
  return username.value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default';
});

/* ── Helpers ── */

function phaseSeverity(phase: string): string {
  switch (phase) {
    case 'active': return 'success';
    case 'terminating': return 'danger';
    default: return 'secondary';
  }
}

function parseKeyValueText(text: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      data[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return data;
}

function labelsToText(labels: Record<string, string>): string {
  return Object.entries(labels).map(([k, v]) => `${k}=${v}`).join('\n');
}

/* ── Create namespace ── */

async function createNamespace() {
  if (!newNamespaceSuffix.value) return;
  const fullName = isAdmin.value
    ? newNamespaceSuffix.value
    : `${rootNamespace.value}/${newNamespaceSuffix.value}`;

  creating.value = true;
  try {
    await api.namespace.create(fullName);
    toast.add({ severity: 'success', summary: 'Namespace Created', detail: `Namespace "${fullName}" created`, life: 5000 });
    newNamespaceSuffix.value = '';
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to create namespace:', err);
    toast.add({ severity: 'error', summary: 'Create Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    creating.value = false;
  }
}

/* ── Edit dialog ── */

function openEditDialog(row: NamespaceRow) {
  editDialog.id = row.id;
  editDialog.name = row.name;
  editDialog.maxPods = row.hasQuota ? (allRows.value.find(r => r.id === row.id) as NamespaceRow | undefined)?.podCount ?? null : null;
  editDialog.maxCpu = row.cpuQuota;
  editDialog.maxMemory = row.memoryQuota;
  editDialog.maxStorage = null;
  editDialog.labelsText = labelsToText(row.labels);
  editDialog.show = true;
}

async function saveEdit() {
  editDialog.saving = true;
  try {
    const updates: Record<string, unknown> = {};

    // Build labels
    const labelsText = editDialog.labelsText.trim();
    if (labelsText) {
      updates.labels = parseKeyValueText(labelsText);
    }

    // Build resource quota if any limits are set
    const hard: Record<string, number> = {};
    if (editDialog.maxPods != null && editDialog.maxPods > 0) hard.pods = editDialog.maxPods;
    if (editDialog.maxCpu != null && editDialog.maxCpu > 0) hard.cpu = editDialog.maxCpu;
    if (editDialog.maxMemory != null && editDialog.maxMemory > 0) hard.memory = editDialog.maxMemory;
    if (editDialog.maxStorage != null && editDialog.maxStorage > 0) hard.storage = editDialog.maxStorage;
    if (Object.keys(hard).length > 0) {
      updates.resourceQuota = { hard };
    }

    await api.namespace.update(editDialog.id, updates);
    toast.add({ severity: 'success', summary: 'Namespace Updated', detail: `Namespace "${editDialog.name}" has been updated`, life: 5000 });
    editDialog.show = false;
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to update namespace:', err);
    toast.add({ severity: 'error', summary: 'Update Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    editDialog.saving = false;
  }
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const result = await api.namespace.list() as {
      namespaces: NamespaceData[];
      total: number;
    };
    const namespaces: NamespaceData[] = result.namespaces ?? [];

    const rows: NamespaceRow[] = namespaces.map((ns) => ({
      id: ns.id,
      name: ns.name,
      phase: ns.phase ?? 'active',
      podCount: ns.resourceUsage?.pods ?? 0,
      cpuUsage: ns.resourceUsage?.cpu ?? null,
      memoryUsage: ns.resourceUsage?.memory ?? null,
      cpuQuota: ns.resourceQuota?.hard?.cpu ?? null,
      memoryQuota: ns.resourceQuota?.hard?.memory ?? null,
      hasQuota: ns.hasQuota ?? false,
      isRoot: ns.name === rootNamespace.value,
      isReserved: RESERVED_NAMES.includes(ns.name),
      labels: ns.labels ?? {},
    }));

    allRows.value = rows;
    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load namespaces:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load namespaces';
  } finally {
    refreshing.value = false;
  }
}

async function deleteNamespace(id: string, name: string) {
  if (RESERVED_NAMES.includes(name)) {
    toast.add({ severity: 'warn', summary: 'Cannot Delete', detail: `Namespace "${name}" is reserved`, life: 5000 });
    return;
  }

  deletingNamespaces.value.add(name);
  try {
    await api.namespace.delete(name);
    toast.add({ severity: 'success', summary: 'Namespace Deleted', detail: `Namespace "${name}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete namespace:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingNamespaces.value.delete(name);
  }
}

onMounted(async () => {
  // Fetch user info for admin detection
  try {
    userInfo.value = await api.auth.whoami();
  } catch {
    // Leave as null — will default to non-admin behavior
  }
  refresh();
  refreshIntervalId = setInterval(refresh, 10000);
});

onBeforeUnmount(() => {
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
</script>

<style scoped>
.namespaces-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.refresh-dot {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 10;
  opacity: 0.5;
}

.state-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: #94a3b8;
  flex: 1;
}
.state-msg.error {
  flex-direction: column;
  color: #f87171;
}

/* ── Root namespace banner ── */
.root-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.06) 0%, transparent 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.root-icon {
  font-size: 1rem;
}

.root-label {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 0.85rem;
}

.root-hint {
  color: #64748b;
  font-size: 0.78rem;
  font-style: italic;
}

/* ── Create form ── */
.create-form {
  padding: 12px;
  background: #181818;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.form-title {
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ns-input-group {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 200px;
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  overflow: hidden;
}

.ns-prefix {
  padding: 6px 2px 6px 10px;
  color: #64748b;
  font-size: 0.85rem;
  white-space: nowrap;
  user-select: none;
}

.ns-input-group .form-input {
  border: none;
  background: transparent;
  flex: 1;
  min-width: 80px;
}

.ns-input-group .form-input:focus {
  outline: none;
  border: none;
}

.form-input {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  flex: 1;
  min-width: 120px;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-input::placeholder {
  color: #475569;
}

.namespaces-table {
  flex: 1;
  min-height: 0;
}

/* ── Namespace cells ── */
.ns-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ns-name-icon {
  font-size: 0.85rem;
}

.ns-name-text {
  font-weight: 600;
  color: #e2e8f0;
}

.root-tag {
  font-size: 0.6rem;
}

.reserved-tag {
  font-size: 0.6rem;
}

.quota-hint {
  color: #64748b;
  font-size: 0.8rem;
}

.action-btns {
  display: flex;
  gap: 2px;
}

/* ── Edit dialog ── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-box {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  width: 440px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dialog-title {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.dialog-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 0 4px;
}
.dialog-close:hover {
  color: #e2e8f0;
}

.dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-section-title {
  font-weight: 600;
  color: #94a3b8;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.dialog-field-row {
  display: flex;
  gap: 12px;
}

.dialog-field-row .dialog-field {
  flex: 1;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dialog-label {
  font-size: 0.8rem;
  color: #94a3b8;
  font-weight: 500;
}

.dialog-input {
  background: #181818;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.85rem;
}

.dialog-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.dialog-textarea {
  background: #181818;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.85rem;
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  resize: vertical;
}

.dialog-textarea:focus {
  outline: none;
  border-color: #3b82f6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* ── Mobile responsive ── */
@media (max-width: 640px) {
  :deep(.hide-on-mobile) {
    display: none !important;
  }

  .form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .root-banner {
    flex-wrap: wrap;
    gap: 4px;
  }

  .dialog-field-row {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
