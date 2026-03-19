<template>
  <div class="volumes-tab">
    <!-- Refreshing indicator -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading volumes…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Main content -->
    <template v-else-if="hasData">
      <!-- Create volume form -->
      <div class="create-form">
        <div class="form-title">Create Volume</div>
        <div class="form-row">
          <input v-model="newVolume.name" placeholder="Volume name" class="form-input" />
          <select v-model="newVolume.nodeId" class="form-select">
            <option value="" disabled>Select node…</option>
            <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.name }}</option>
          </select>
          <Button
            icon="pi pi-plus"
            label="Create"
            severity="success"
            size="small"
            :loading="creating"
            @click="createVolume"
            :disabled="!newVolume.name || !newVolume.nodeId"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="allRows.length === 0" class="state-msg">
        No volumes found. Create one above.
      </div>

      <!-- Volumes table grouped by node -->
      <DataTable
        v-else
        :value="allRows"
        rowGroupMode="subheader"
        groupRowsBy="groupKey"
        sortField="groupKey"
        :sortOrder="1"
        expandableRowGroups
        v-model:expandedRowGroups="expandedGroups"
        scrollable
        scrollHeight="flex"
        :rowHover="true"
        stripedRows
        class="volumes-table"
      >
        <template #groupheader="{ data }">
          <div class="group-header" @click="toggleGroup(data.groupKey)">
            <i :class="['pi', expandedGroups.includes(data.groupKey) ? 'pi-chevron-down' : 'pi-chevron-right', 'chevron-icon']" />
            <span class="group-icon">⎈</span>
            <span class="group-name">{{ data.nodeName }}</span>
            <Tag :value="`${groupCounts[data.groupKey] ?? 0} volume${(groupCounts[data.groupKey] ?? 0) !== 1 ? 's' : ''}`" severity="secondary" />
          </div>
        </template>

        <Column field="name" header="Name" sortable style="min-width: 140px">
          <template #body="{ data }">
            <span class="volume-name">💾 {{ data.name }}</span>
          </template>
        </Column>
        <Column field="namespace" header="Namespace" sortable style="min-width: 100px" />
        <Column field="nodeName" header="Node" sortable class="hide-on-mobile" style="min-width: 100px" />
        <Column header="Actions" style="min-width: 100px">
          <template #body="{ data }">
            <div class="action-btns">
              <Button
                icon="pi pi-download"
                severity="info"
                size="small"
                text
                :loading="downloadingVolumes.has(data.id)"
                @click="startDownload(data)"
                title="Download as ZIP"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                text
                :loading="deletingVolumes.has(data.id)"
                @click="deleteVolume(data.id, data.name)"
                title="Delete volume"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </template>

    <!-- FilesPicker for choosing save location -->
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save Volume Archive"
      :extensions="zipExtensions"
      initialPath="/home"
      :defaultFileName="saveDefaultName"
      @select="onSaveLocationSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface VolumeData {
  id: string;
  name: string;
  namespace?: string;
  nodeId?: string;
}

interface NodeData {
  id: string;
  name: string;
}

interface VolumeRow {
  id: string;
  name: string;
  namespace: string;
  nodeId: string;
  nodeName: string;
  groupKey: string;
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const creating = ref(false);
const allRows = ref<VolumeRow[]>([]);
const nodes = ref<NodeData[]>([]);
const expandedGroups = ref<string[]>([]);
const deletingVolumes = ref<Set<string>>(new Set());
const downloadingVolumes = ref<Set<string>>(new Set());
const showSavePicker = ref(false);
const saveDefaultName = ref('volume.zip');
let pendingZipData: Uint8Array | null = null;
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const zipExtensions = [{ label: 'ZIP Archive', extensions: ['.zip'] }];

const UNASSIGNED_NODE = 'Unassigned';

const newVolume = reactive({ name: '', nodeId: '' });

const api = useStarkApi();
const toast = useToast();

const groupCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const row of allRows.value) {
    counts[row.groupKey] = (counts[row.groupKey] ?? 0) + 1;
  }
  return counts;
});

/* ── Data loading ── */

function toggleGroup(groupKey: string) {
  const idx = expandedGroups.value.indexOf(groupKey);
  if (idx >= 0) {
    expandedGroups.value = expandedGroups.value.filter((k) => k !== groupKey);
  } else {
    expandedGroups.value = [...expandedGroups.value, groupKey];
  }
}

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const [volumeResult, nodeResult] = await Promise.all([
      api.volume.list() as Promise<{ volumes: VolumeData[] }>,
      api.node.list() as Promise<{ nodes: NodeData[] }>,
    ]);

    const vols: VolumeData[] = volumeResult.volumes ?? [];
    const nodeList: NodeData[] = nodeResult.nodes ?? [];
    nodes.value = nodeList;

    const nodeMap = new Map<string, string>();
    for (const n of nodeList) nodeMap.set(n.id, n.name);

    const rows: VolumeRow[] = vols.map((v) => {
      const nodeName = v.nodeId ? (nodeMap.get(v.nodeId) ?? v.nodeId) : UNASSIGNED_NODE;
      return {
        id: v.id,
        name: v.name,
        namespace: v.namespace ?? 'default',
        nodeId: v.nodeId ?? '',
        nodeName,
        groupKey: nodeName,
      };
    });

    allRows.value = rows;

    if (!hasData.value) {
      expandedGroups.value = [...new Set(rows.map((r) => r.groupKey))];
    }

    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load volumes:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load volumes';
  } finally {
    refreshing.value = false;
  }
}

async function createVolume() {
  if (!newVolume.name || !newVolume.nodeId) return;
  const node = nodes.value.find((n) => n.id === newVolume.nodeId);
  if (!node) {
    toast.add({ severity: 'error', summary: 'Create Failed', detail: 'Selected node no longer available', life: 5000 });
    return;
  }
  creating.value = true;
  try {
    await api.volume.create(newVolume.name, node.name);
    toast.add({ severity: 'success', summary: 'Volume Created', detail: `Volume "${newVolume.name}" created`, life: 5000 });
    newVolume.name = '';
    newVolume.nodeId = '';
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to create volume:', err);
    toast.add({ severity: 'error', summary: 'Create Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    creating.value = false;
  }
}

async function deleteVolume(id: string, name: string) {
  deletingVolumes.value.add(id);
  try {
    await api.volume.delete(id);
    toast.add({ severity: 'success', summary: 'Volume Deleted', detail: `Volume "${name}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete volume:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingVolumes.value.delete(id);
  }
}

async function startDownload(row: VolumeRow) {
  if (!row.nodeName || row.nodeName === UNASSIGNED_NODE) {
    toast.add({ severity: 'warn', summary: 'Cannot Download', detail: 'Volume has no assigned node', life: 5000 });
    return;
  }
  downloadingVolumes.value.add(row.id);
  try {
    const zipData = await api.volume.downloadAsZip(row.name, row.nodeName);
    pendingZipData = zipData;
    saveDefaultName.value = `${row.name}.zip`;
    showSavePicker.value = true;
  } catch (err: unknown) {
    console.error('Failed to download volume:', err);
    toast.add({ severity: 'error', summary: 'Download Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    downloadingVolumes.value.delete(row.id);
  }
}

async function onSaveLocationSelected(result: { paths: string[]; fileName?: string }) {
  if (!pendingZipData || result.paths.length === 0) {
    pendingZipData = null;
    return;
  }
  try {
    const root = await getStarkOpfsRoot();
    const fh = await getFileHandle(root, result.paths[0], true);
    const writable = await fh.createWritable();
    await writable.write(new Blob([pendingZipData], { type: 'application/zip' }));
    await writable.close();
    toast.add({ severity: 'success', summary: 'Volume Saved', detail: `Saved to ${result.fileName ?? result.paths[0]}`, life: 5000 });
  } catch (err: unknown) {
    console.error('Failed to save zip:', err);
    toast.add({ severity: 'error', summary: 'Save Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    pendingZipData = null;
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
.volumes-tab {
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
  min-width: 140px;
}

.volumes-table {
  flex: 1;
  min-height: 0;
}

/* ── Group header ── */
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
  border-left: 3px solid #6366f1;
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, transparent 100%);
}

.chevron-icon {
  font-size: 0.75rem;
  color: #64748b;
  flex-shrink: 0;
}

.group-icon {
  color: #818cf8;
  font-size: 0.9rem;
}

.group-name {
  font-weight: 600;
  color: #e2e8f0;
}

.volume-name {
  font-weight: 600;
  color: #e2e8f0;
}

.action-btns {
  display: flex;
  gap: 2px;
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
