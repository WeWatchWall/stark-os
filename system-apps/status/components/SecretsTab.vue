<template>
  <div class="secrets-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading secrets…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Main content -->
    <template v-else-if="hasData">
      <!-- Create secret form -->
      <div class="create-form">
        <div class="form-title">Create Secret</div>
        <div class="form-row">
          <input v-model="newSecret.name" placeholder="Secret name" class="form-input" />
          <input v-model="newSecret.namespace" placeholder="Namespace" class="form-input" />
          <select v-model="newSecret.type" class="form-select">
            <option value="opaque">Opaque</option>
          </select>
          <select v-model="newSecret.injectionMode" class="form-select">
            <option value="env">Env</option>
            <option value="volume">Volume</option>
          </select>
          <Button
            icon="pi pi-plus"
            label="Create"
            severity="success"
            size="small"
            :loading="creating"
            @click="openCreateDialog"
            :disabled="!newSecret.name"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="allRows.length === 0" class="state-msg">
        No secrets found. Create one above.
      </div>

      <!-- Secrets grouped by namespace -->
      <DataTable
        v-else
        :value="allRows"
        rowGroupMode="subheader"
        groupRowsBy="namespace"
        sortField="namespace"
        :sortOrder="1"
        expandableRowGroups
        v-model:expandedRowGroups="expandedGroups"
        scrollable
        scrollHeight="flex"
        :rowHover="true"
        stripedRows
        class="secrets-table"
      >
        <template #groupheader="{ data }">
          <div class="group-header">
            <i :class="['pi', expandedGroups.includes(data.namespace) ? 'pi-chevron-down' : 'pi-chevron-right', 'chevron-icon']" />
            <span class="ns-icon">🔐</span>
            <span class="ns-name">{{ data.namespace }}</span>
            <Tag :value="`${namespaceCounts[data.namespace] ?? 0} secret${(namespaceCounts[data.namespace] ?? 0) !== 1 ? 's' : ''}`" severity="info" />
          </div>
        </template>

        <Column field="name" header="Name" sortable style="min-width: 140px">
          <template #body="{ data }">
            <span class="secret-name">{{ data.name }}</span>
          </template>
        </Column>
        <Column field="type" header="Type" sortable style="min-width: 100px">
          <template #body="{ data }">
            <Tag :value="data.type" :severity="typeSeverity(data.type)" />
          </template>
        </Column>
        <Column field="injectionMode" header="Injection" sortable style="min-width: 80px">
          <template #body="{ data }">
            <Tag :value="data.injectionMode" severity="secondary" />
          </template>
        </Column>
        <Column field="keyCount" header="Keys" sortable class="hide-on-mobile" style="min-width: 60px" />
        <Column field="version" header="Version" sortable class="hide-on-mobile" style="min-width: 70px" />
        <Column header="Actions" style="min-width: 100px">
          <template #body="{ data }">
            <div class="action-btns">
              <Button
                icon="pi pi-pencil"
                severity="info"
                size="small"
                text
                @click="openEditDialog(data)"
                title="Edit secret"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                :loading="deletingSecrets.has(data.name + '/' + data.namespace)"
                @click="deleteSecret(data.name, data.namespace)"
                title="Delete secret"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </template>

    <!-- Create secret dialog -->
    <div v-if="createDialog.show" class="dialog-overlay" @click.self="createDialog.show = false">
      <div class="dialog-box" @click.stop>
        <div class="dialog-header">
          <span class="dialog-title">Create Secret — "{{ newSecret.name }}"</span>
          <button class="dialog-close" @click="createDialog.show = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="dialog-field">
            <label class="dialog-label">Data (key=value pairs, one per line)</label>
            <textarea v-model="createDialog.dataText" rows="6" class="dialog-textarea" placeholder="KEY=value&#10;ANOTHER_KEY=another_value"></textarea>
          </div>
          <div v-if="newSecret.injectionMode === 'env'" class="dialog-field">
            <label class="dialog-label">Env Prefix (optional)</label>
            <input v-model="createDialog.envPrefix" class="dialog-input" placeholder="MY_APP_" />
          </div>
          <div v-if="newSecret.injectionMode === 'volume'" class="dialog-field">
            <label class="dialog-label">Mount Path</label>
            <input v-model="createDialog.mountPath" class="dialog-input" placeholder="/etc/secrets" />
          </div>
        </div>
        <div class="dialog-footer">
          <Button label="Cancel" severity="secondary" size="small" text @click="createDialog.show = false" />
          <Button label="Create" severity="success" size="small" :loading="creating" @click="createSecret" />
        </div>
      </div>
    </div>

    <!-- Edit secret dialog -->
    <div v-if="editDialog.show" class="dialog-overlay" @click.self="editDialog.show = false">
      <div class="dialog-box" @click.stop>
        <div class="dialog-header">
          <span class="dialog-title">Edit Secret — "{{ editDialog.name }}"</span>
          <button class="dialog-close" @click="editDialog.show = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div v-if="editDialog.loading" class="state-msg" style="padding: 20px;">
            <ProgressSpinner style="width: 18px; height: 18px" strokeWidth="5" />
            <span>Loading key names…</span>
          </div>
          <template v-else>
            <div class="dialog-field">
              <label class="dialog-label">Data (key=value pairs, one per line — replace &lt;redacted&gt; to update)</label>
              <textarea v-model="editDialog.dataText" rows="6" class="dialog-textarea" placeholder="KEY=value&#10;ANOTHER_KEY=another_value"></textarea>
            </div>
            <div class="dialog-field">
              <label class="dialog-label">Injection Mode</label>
              <select v-model="editDialog.injectionMode" class="dialog-select">
                <option value="env">Env</option>
                <option value="volume">Volume</option>
              </select>
            </div>
            <div v-if="editDialog.injectionMode === 'env'" class="dialog-field">
              <label class="dialog-label">Env Prefix (optional)</label>
              <input v-model="editDialog.envPrefix" class="dialog-input" placeholder="MY_APP_" />
            </div>
            <div v-if="editDialog.injectionMode === 'volume'" class="dialog-field">
              <label class="dialog-label">Mount Path</label>
              <input v-model="editDialog.mountPath" class="dialog-input" placeholder="/etc/secrets" />
            </div>
          </template>
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

interface SecretData {
  id: string;
  name: string;
  namespace: string;
  type: string;
  injection: { mode: string; prefix?: string; mountPath?: string };
  keyCount: number;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SecretRow {
  id: string;
  name: string;
  namespace: string;
  type: string;
  injectionMode: string;
  keyCount: number;
  version: number;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const creating = ref(false);
const allRows = ref<SecretRow[]>([]);
const expandedGroups = ref<string[]>([]);
const deletingSecrets = ref<Set<string>>(new Set());
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const newSecret = reactive({
  name: '',
  namespace: 'default',
  type: 'opaque',
  injectionMode: 'env',
});

const createDialog = reactive({
  show: false,
  dataText: '',
  envPrefix: '',
  mountPath: '/etc/secrets',
});

const editDialog = reactive({
  show: false,
  saving: false,
  loading: false,
  name: '',
  namespace: '',
  injectionMode: 'env',
  dataText: '',
  envPrefix: '',
  mountPath: '',
});

const api = useStarkApi();
const toast = useToast();

const namespaceCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const row of allRows.value) {
    counts[row.namespace] = (counts[row.namespace] ?? 0) + 1;
  }
  return counts;
});

/* ── Helpers ── */

function typeSeverity(type: string): string {
  switch (type) {
    case 'opaque': return 'secondary';
    case 'tls': return 'success';
    case 'docker-registry': return 'info';
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

function buildInjection(mode: string, envPrefix: string, mountPath: string) {
  if (mode === 'volume') {
    return { mode: 'volume' as const, mountPath: mountPath || '/etc/secrets' };
  }
  const injection: Record<string, unknown> = { mode: 'env' };
  if (envPrefix) injection.prefix = envPrefix;
  return injection;
}

/* ── Create dialog ── */

function openCreateDialog() {
  if (!newSecret.name) return;
  createDialog.dataText = '';
  createDialog.envPrefix = '';
  createDialog.mountPath = '/etc/secrets';
  createDialog.show = true;
}

async function createSecret() {
  const data = parseKeyValueText(createDialog.dataText);
  if (Object.keys(data).length === 0) {
    toast.add({ severity: 'warn', summary: 'No Data', detail: 'Please provide at least one key=value pair', life: 5000 });
    return;
  }

  creating.value = true;
  try {
    const injection = buildInjection(newSecret.injectionMode, createDialog.envPrefix, createDialog.mountPath);
    await api.secret.create({
      name: newSecret.name,
      namespace: newSecret.namespace || 'default',
      type: newSecret.type,
      data,
      injection,
    });
    toast.add({ severity: 'success', summary: 'Secret Created', detail: `Secret "${newSecret.name}" created`, life: 5000 });
    newSecret.name = '';
    createDialog.show = false;
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to create secret:', err);
    toast.add({ severity: 'error', summary: 'Create Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    creating.value = false;
  }
}

/* ── Edit dialog ── */

async function openEditDialog(row: SecretRow) {
  editDialog.name = row.name;
  editDialog.namespace = row.namespace;
  editDialog.injectionMode = row.injectionMode;
  editDialog.dataText = '';
  editDialog.envPrefix = '';
  editDialog.mountPath = '';
  editDialog.loading = true;
  editDialog.show = true;

  // Fetch key names from server to pre-populate with redacted values
  try {
    const result = await api.secret.get(row.name, row.namespace) as { secret: { keyNames?: string[]; injection?: { mode: string; prefix?: string; mountPath?: string } } };
    const keyNames: string[] = result.secret?.keyNames ?? [];
    if (keyNames.length > 0) {
      editDialog.dataText = keyNames.map((k) => `${k}=<redacted>`).join('\n');
    }
    // Pre-fill injection settings from the fetched data
    const inj = result.secret?.injection;
    if (inj) {
      editDialog.injectionMode = inj.mode ?? 'env';
      editDialog.envPrefix = inj.prefix ?? '';
      editDialog.mountPath = inj.mountPath ?? '';
    }
  } catch {
    // If fetch fails, leave empty — user can still edit
  } finally {
    editDialog.loading = false;
  }
}

async function saveEdit() {
  editDialog.saving = true;
  try {
    const updates: Record<string, unknown> = {};
    const dataText = editDialog.dataText.trim();
    if (dataText) {
      // Parse key=value pairs, filtering out unchanged redacted entries
      const parsed = parseKeyValueText(dataText);
      const changed: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== '<redacted>') changed[k] = v;
      }
      if (Object.keys(changed).length > 0) {
        updates.data = changed;
      }
    }
    updates.injection = buildInjection(editDialog.injectionMode, editDialog.envPrefix, editDialog.mountPath);
    await api.secret.update(editDialog.name, updates, editDialog.namespace);
    toast.add({ severity: 'success', summary: 'Secret Updated', detail: `Secret "${editDialog.name}" has been updated`, life: 5000 });
    editDialog.show = false;
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to update secret:', err);
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
    const result = await api.secret.list() as { secrets: SecretData[] };
    const secrets: SecretData[] = result.secrets ?? [];

    const rows: SecretRow[] = secrets.map((s) => ({
      id: s.id,
      name: s.name,
      namespace: s.namespace ?? 'default',
      type: s.type,
      injectionMode: s.injection?.mode ?? 'env',
      keyCount: s.keyCount ?? 0,
      version: s.version ?? 1,
    }));

    allRows.value = rows;

    if (!hasData.value) {
      expandedGroups.value = [...new Set(rows.map((r) => r.namespace))];
    }

    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load secrets:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load secrets';
  } finally {
    refreshing.value = false;
  }
}

async function deleteSecret(name: string, namespace: string) {
  const key = name + '/' + namespace;
  deletingSecrets.value.add(key);
  try {
    await api.secret.delete(name, namespace);
    toast.add({ severity: 'success', summary: 'Secret Deleted', detail: `Secret "${name}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete secret:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingSecrets.value.delete(key);
  }
}

onMounted(() => {
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
.secrets-tab {
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

.form-select {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  min-width: 100px;
}

.secrets-table {
  flex: 1;
  min-height: 0;
}

/* ── Group header ── */
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, transparent 100%);
  border-left: 3px solid #f59e0b;
}

.chevron-icon {
  font-size: 0.75rem;
  color: #64748b;
  flex-shrink: 0;
}

.ns-icon {
  font-size: 0.9rem;
}

.ns-name {
  font-weight: 600;
  color: #e2e8f0;
}

/* ── Secret cells ── */
.secret-name {
  font-weight: 600;
  color: #e2e8f0;
}

.action-btns {
  display: flex;
  gap: 2px;
}

/* ── Dialogs ── */
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
  width: 420px;
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

.dialog-select {
  background: #181818;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.85rem;
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

  .group-header {
    gap: 4px;
    padding: 6px 8px;
  }
}
</style>
