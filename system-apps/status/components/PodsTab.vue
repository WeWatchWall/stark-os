<template>
  <div class="pods-tab">
    <!-- Refreshing indicator — subtle dot in top-right corner -->
    <div v-if="refreshing && hasData" class="refresh-dot" title="Updating…">
      <ProgressSpinner style="width: 12px; height: 12px" strokeWidth="6" />
    </div>

    <!-- Initial loading state (no data yet) -->
    <div v-if="!hasData && refreshing" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading pods…</span>
    </div>

    <!-- Error state (no data yet) -->
    <div v-else-if="!hasData && errorMsg" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="refresh" />
    </div>

    <!-- Empty state -->
    <div v-else-if="hasData && allRows.length === 0" class="state-msg">
      No nodes or pods found.
    </div>

    <!-- Manual collapsible node groups (no PrimeVue row grouping) -->
    <div v-else-if="hasData" class="pods-scroll-area">
      <div v-for="group in groupedData" :key="group.groupKey" class="node-group">
        <!-- Node header row — chevron + info + delete all on one line -->
        <div class="group-header" @click="toggleGroup(group.groupKey)">
          <i :class="['pi', isExpanded(group.groupKey) ? 'pi-chevron-down' : 'pi-chevron-right', 'chevron-icon']" />
          <span class="machine-badge">{{ group.machineIndex }}</span>
          <span class="node-icon">⎈</span>
          <span class="node-name">{{ group.nodeName }}</span>
          <Tag :value="group.nodeStatus" :severity="nodeStatusSeverity(group.nodeStatus)" class="node-tag" />
          <Button
            icon="pi pi-trash"
            label="Delete Node"
            severity="danger"
            size="small"
            text
            :loading="deletingNodes.has(group.nodeId)"
            @click.stop="deleteNode(group.nodeId, group.nodeName)"
            class="node-delete-btn"
          />
        </div>

        <!-- Pod table for this node (shown when expanded) -->
        <DataTable
          v-if="isExpanded(group.groupKey)"
          :value="group.rows"
          :rowHover="true"
          stripedRows
          class="pods-table"
        >
          <Column field="shortId" header="ID" sortable>
            <template #body="{ data }">
              <span v-if="data.isPlaceholder" class="no-pods-msg">No pods on this node</span>
              <span v-else class="mono">{{ data.shortId }}</span>
            </template>
          </Column>
          <Column field="packName" header="Pack" sortable>
            <template #body="{ data }">
              <span v-if="!data.isPlaceholder">{{ data.packName }}</span>
            </template>
          </Column>
          <Column field="status" header="Status" sortable class="hide-on-mobile">
            <template #body="{ data }">
              <Tag v-if="!data.isPlaceholder" :value="data.status" :severity="podStatusSeverity(data.status)" />
            </template>
          </Column>
          <Column field="packVersion" header="Version" sortable class="hide-on-mobile">
            <template #body="{ data }">
              <span v-if="!data.isPlaceholder" class="mono">{{ data.packVersion }}</span>
            </template>
          </Column>
          <Column field="namespace" header="Namespace" sortable class="hide-on-mobile" />
          <Column field="age" header="Age" sortable>
            <template #body="{ data }">
              <span v-if="!data.isPlaceholder">{{ data.age }}</span>
            </template>
          </Column>
          <Column header="Actions">
            <template #body="{ data }">
              <Button
                v-if="!data.isPlaceholder && canStop(data.status)"
                icon="pi pi-stop"
                label="Stop"
                severity="danger"
                size="small"
                text
                :loading="stoppingPods.has(data.id)"
                @click="stopPod(data.id)"
              />
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface PodData {
  id: string;
  packId: string;
  packVersion: string;
  nodeId: string | null;
  status: string;
  namespace: string;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

interface NodeData {
  id: string;
  name: string;
  status: string;
  machineId?: string;
}

interface PackData {
  id: string;
  name: string;
}

interface PodRow {
  id: string;
  shortId: string;
  packName: string;
  packVersion: string;
  status: string;
  namespace: string;
  age: string;
  nodeName: string;
  nodeId: string;
  nodeStatus: string;
  machineIndex: number;
  groupKey: string;
  isPlaceholder?: boolean;
}

interface NodeGroup {
  groupKey: string;
  nodeName: string;
  nodeId: string;
  nodeStatus: string;
  machineIndex: number;
  rows: PodRow[];
}

/* ── State ── */

const refreshing = ref(false);
const hasData = ref(false);
const errorMsg = ref('');
const allRows = ref<PodRow[]>([]);
const expandedGroupKeys = ref<Set<string>>(new Set());
const stoppingPods = ref<Set<string>>(new Set());
const deletingNodes = ref<Set<string>>(new Set());
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

const api = useStarkApi();
const toast = useToast();

/* ── Grouped data computed ── */

const groupedData = computed<NodeGroup[]>(() => {
  const map = new Map<string, NodeGroup>();
  for (const row of allRows.value) {
    let group = map.get(row.groupKey);
    if (!group) {
      group = {
        groupKey: row.groupKey,
        nodeName: row.nodeName,
        nodeId: row.nodeId,
        nodeStatus: row.nodeStatus,
        machineIndex: row.machineIndex,
        rows: [],
      };
      map.set(row.groupKey, group);
    }
    group.rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.groupKey.localeCompare(b.groupKey));
});

function isExpanded(groupKey: string): boolean {
  return expandedGroupKeys.value.has(groupKey);
}

function toggleGroup(groupKey: string) {
  const s = new Set(expandedGroupKeys.value);
  if (s.has(groupKey)) s.delete(groupKey);
  else s.add(groupKey);
  expandedGroupKeys.value = s;
}

/* ── Helpers ── */

function shortUuid(uuid: string): string {
  return uuid.split('-')[0] ?? uuid.substring(0, 8);
}

function formatAge(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function canStop(status: string): boolean {
  return ['running', 'pending', 'scheduled', 'starting'].includes(status);
}

function podStatusSeverity(status: string): string {
  switch (status) {
    case 'running': return 'success';
    case 'pending': case 'scheduled': case 'starting': return 'info';
    case 'stopping': return 'warn';
    case 'stopped': return 'secondary';
    case 'failed': case 'evicted': return 'danger';
    default: return 'secondary';
  }
}

function nodeStatusSeverity(status: string): string {
  switch (status) {
    case 'online': return 'success';
    case 'offline': return 'danger';
    case 'draining': return 'warn';
    default: return 'secondary';
  }
}

/* ── Data loading ── */

async function refresh() {
  refreshing.value = true;
  errorMsg.value = '';

  try {
    const [podResult, nodeResult, packResult] = await Promise.all([
      api.pod.list() as Promise<{ pods: PodData[] }>,
      api.node.list() as Promise<{ nodes: NodeData[] }>,
      api.pack.list() as Promise<{ packs: PackData[] }>,
    ]);

    const STALE_POD_THRESHOLD_MS = 5 * 60 * 1000;
    const pods: PodData[] = (podResult.pods ?? []).filter((p) => {
      if (!['stopped', 'failed', 'evicted'].includes(p.status)) return true;
      const referenceTime = new Date(p.stoppedAt ?? p.createdAt).getTime();
      return Date.now() - referenceTime < STALE_POD_THRESHOLD_MS;
    });
    const nodes: NodeData[] = nodeResult.nodes ?? [];
    const packs: PackData[] = packResult.packs ?? [];

    // Build lookups
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const packMap = new Map<string, string>();
    for (const p of packs) packMap.set(p.id, p.name);

    // Assign stable machine indices (grouped by machineId, ordered by first appearance)
    const machineIds: string[] = [];
    for (const n of nodes) {
      const mid = n.machineId ?? '__unknown__';
      if (!machineIds.includes(mid)) machineIds.push(mid);
    }

    // Build pod rows grouped by node
    const podsByNode = new Map<string, PodRow[]>();
    for (const p of pods) {
      const node = p.nodeId ? nodeMap.get(p.nodeId) : undefined;
      const machineId = node?.machineId ?? '__unknown__';
      let machineIndex = machineIds.indexOf(machineId) + 1;
      if (machineIndex === 0) {
        machineIds.push(machineId);
        machineIndex = machineIds.length;
      }
      const nodeName = node?.name ?? (p.nodeId ? shortUuid(p.nodeId) : 'Unassigned');
      const nodeStatus = node?.status ?? 'unknown';
      const packName = packMap.get(p.packId) ?? shortUuid(p.packId);
      const nodeId = p.nodeId ?? '';
      const groupKey = `${machineIndex}-${nodeName}`;

      if (!podsByNode.has(nodeId)) podsByNode.set(nodeId, []);
      podsByNode.get(nodeId)!.push({
        id: p.id,
        shortId: shortUuid(p.id),
        packName,
        packVersion: p.packVersion,
        status: p.status,
        namespace: p.namespace,
        age: formatAge(p.startedAt ?? p.createdAt),
        nodeName,
        nodeId,
        nodeStatus,
        machineIndex,
        groupKey,
      });
    }

    // Build final rows - include all nodes, even those without pods
    const rows: PodRow[] = [];
    for (const n of nodes) {
      const machineId = n.machineId ?? '__unknown__';
      let machineIndex = machineIds.indexOf(machineId) + 1;
      if (machineIndex === 0) {
        machineIds.push(machineId);
        machineIndex = machineIds.length;
      }
      const groupKey = `${machineIndex}-${n.name}`;
      const nodePods = podsByNode.get(n.id);

      if (nodePods && nodePods.length > 0) {
        rows.push(...nodePods);
      } else {
        // Placeholder row so the node still shows
        rows.push({
          id: `placeholder-${n.id}`,
          shortId: '',
          packName: '',
          packVersion: '',
          status: '',
          namespace: '',
          age: '',
          nodeName: n.name,
          nodeId: n.id,
          nodeStatus: n.status,
          machineIndex,
          groupKey,
          isPlaceholder: true,
        });
      }
    }

    // Add unassigned pods (nodeId empty / not matched to a node)
    const unassigned = podsByNode.get('');
    if (unassigned) rows.push(...unassigned);

    allRows.value = rows;

    // On first load expand all groups
    if (!hasData.value) {
      const allGroupKeys = [...new Set(rows.map((r) => r.groupKey))];
      expandedGroupKeys.value = new Set(allGroupKeys);
    }

    hasData.value = true;
  } catch (err: unknown) {
    console.error('Failed to load pods:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load pods';
  } finally {
    refreshing.value = false;
  }
}

async function stopPod(podId: string) {
  stoppingPods.value.add(podId);
  try {
    await api.pod.stop(podId);
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to stop pod:', err);
    toast.add({ severity: 'error', summary: 'Stop Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    stoppingPods.value.delete(podId);
  }
}

async function deleteNode(nodeId: string, nodeName: string) {
  if (!nodeId) return;
  deletingNodes.value.add(nodeId);
  try {
    await api.node.delete(nodeId);
    toast.add({ severity: 'success', summary: 'Node Deleted', detail: `Node "${nodeName}" has been removed`, life: 5000 });
    await refresh();
  } catch (err: unknown) {
    console.error('Failed to delete node:', err);
    toast.add({ severity: 'error', summary: 'Delete Failed', detail: err instanceof Error ? err.message : 'Unknown error', life: 5000 });
  } finally {
    deletingNodes.value.delete(nodeId);
  }
}

onMounted(() => {
  refresh();
  // Auto-refresh every 10 seconds (half speed)
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
.pods-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* ── Refresh indicator ── */
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

/* ── Scroll area for node groups ── */
.pods-scroll-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.node-group {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* ── Group header styling — all on one line ── */
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.10) 0%, transparent 100%);
  border-left: 3px solid #3b82f6;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, transparent 100%);
}

.chevron-icon {
  font-size: 0.75rem;
  color: #64748b;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.machine-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.node-icon {
  color: #60a5fa;
  font-size: 0.9rem;
}

.node-name {
  font-weight: 600;
  color: #e2e8f0;
}

.node-tag {
  font-size: 0.65rem;
}

.node-delete-btn {
  margin-left: auto;
  font-size: 0.75rem;
}

.pods-table {
  border-left: 3px solid rgba(59, 130, 246, 0.05);
}

.mono {
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 0.9em;
}

.no-pods-msg {
  color: #64748b;
  font-style: italic;
}

/* ── Mobile responsive ── */
@media (max-width: 640px) {
  .group-header {
    gap: 4px;
    padding: 6px 8px;
    flex-wrap: wrap;
  }

  .node-delete-btn :deep(.p-button-label) {
    display: none;
  }

  .node-delete-btn {
    margin-left: auto;
  }

  :deep(.hide-on-mobile) {
    display: none !important;
  }
}
</style>
