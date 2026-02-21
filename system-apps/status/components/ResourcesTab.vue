<template>
  <div class="resources-tab">
    <!-- Loading state -->
    <div v-if="loading && !hasData" class="state-msg">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span>Loading resources…</span>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMsg && !hasData" class="state-msg error">
      <span>{{ errorMsg }}</span>
      <Button label="Retry" severity="secondary" size="small" @click="fetchResources" />
    </div>

    <!-- Resource dashboard -->
    <div v-else class="dashboard">
      <!-- Cluster summary cards -->
      <div class="card-grid">
        <!-- Nodes card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon nodes-icon">⎈</span>
              Nodes
            </div>
          </template>
          <template #content>
            <div class="stat-row">
              <Knob
                :modelValue="resources.nodes.online"
                :max="Math.max(resources.nodes.total, 1)"
                :size="80"
                :strokeWidth="6"
                valueColor="#3b82f6"
                rangeColor="#334155"
                readonly
                valueTemplate="{value}"
              />
              <div class="stat-details">
                <div class="stat-line"><span class="stat-value">{{ resources.nodes.total }}</span> total</div>
                <div class="stat-line success"><span class="stat-value">{{ resources.nodes.online }}</span> online</div>
                <div v-if="resources.nodes.offline > 0" class="stat-line danger"><span class="stat-value">{{ resources.nodes.offline }}</span> offline</div>
              </div>
            </div>
          </template>
        </Card>

        <!-- Pods card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon pods-icon">◉</span>
              Pods
            </div>
          </template>
          <template #content>
            <div class="stat-row">
              <Knob
                :modelValue="resources.pods.running"
                :max="Math.max(resources.pods.total, 1)"
                :size="80"
                :strokeWidth="6"
                valueColor="#22c55e"
                rangeColor="#334155"
                readonly
                valueTemplate="{value}"
              />
              <div class="stat-details">
                <div class="stat-line"><span class="stat-value">{{ resources.pods.total }}</span> total</div>
                <div class="stat-line success"><span class="stat-value">{{ resources.pods.running }}</span> running</div>
                <div v-if="resources.pods.pending > 0" class="stat-line info"><span class="stat-value">{{ resources.pods.pending }}</span> pending</div>
                <div v-if="resources.pods.failed > 0" class="stat-line danger"><span class="stat-value">{{ resources.pods.failed }}</span> failed</div>
                <div v-if="resources.pods.stopped > 0" class="stat-line muted"><span class="stat-value">{{ resources.pods.stopped }}</span> stopped</div>
              </div>
            </div>
          </template>
        </Card>

        <!-- CPU card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon cpu-icon">⚡</span>
              CPU
            </div>
          </template>
          <template #content>
            <div class="bar-section">
              <div class="bar-label">
                <span>{{ formatCpu(resources.cpu.allocated) }} / {{ formatCpu(resources.cpu.total) }}</span>
                <span class="bar-pct">{{ resources.cpu.percent }}%</span>
              </div>
              <ProgressBar :value="resources.cpu.percent" :showValue="false" class="resource-bar cpu-bar" />
            </div>
          </template>
        </Card>

        <!-- Memory card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon mem-icon">🧠</span>
              Memory
            </div>
          </template>
          <template #content>
            <div class="bar-section">
              <div class="bar-label">
                <span>{{ formatMemory(resources.memory.allocated) }} / {{ formatMemory(resources.memory.total) }}</span>
                <span class="bar-pct">{{ resources.memory.percent }}%</span>
              </div>
              <ProgressBar :value="resources.memory.percent" :showValue="false" class="resource-bar mem-bar" />
            </div>
          </template>
        </Card>

        <!-- Storage card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon storage-icon">💾</span>
              Storage
            </div>
          </template>
          <template #content>
            <div class="bar-section">
              <div class="bar-label">
                <span>{{ formatMemory(resources.storage.allocated) }} / {{ formatMemory(resources.storage.total) }}</span>
                <span class="bar-pct">{{ resources.storage.percent }}%</span>
              </div>
              <ProgressBar :value="resources.storage.percent" :showValue="false" class="resource-bar storage-bar" />
            </div>
          </template>
        </Card>

        <!-- Pod capacity card -->
        <Card class="resource-card">
          <template #title>
            <div class="card-title">
              <span class="card-icon cap-icon">📦</span>
              Pod Capacity
            </div>
          </template>
          <template #content>
            <div class="bar-section">
              <div class="bar-label">
                <span>{{ resources.podCapacity.allocated }} / {{ resources.podCapacity.total }}</span>
                <span class="bar-pct">{{ resources.podCapacity.percent }}%</span>
              </div>
              <ProgressBar :value="resources.podCapacity.percent" :showValue="false" class="resource-bar cap-bar" />
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStarkApi } from '../composables/useStarkApi';

/* ── Types ── */

interface NodeData {
  id: string;
  name: string;
  status: string;
  allocatable: { cpu: number; memory: number; pods: number; storage: number };
  allocated: { cpu: number; memory: number; pods: number; storage: number };
}

interface PodData {
  id: string;
  status: string;
}

interface ResourceState {
  nodes: { total: number; online: number; offline: number };
  pods: { total: number; running: number; pending: number; failed: number; stopped: number };
  cpu: { total: number; allocated: number; percent: number };
  memory: { total: number; allocated: number; percent: number };
  storage: { total: number; allocated: number; percent: number };
  podCapacity: { total: number; allocated: number; percent: number };
}

/* ── State ── */

const loading = ref(true);
const errorMsg = ref('');
const hasData = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;

const resources = reactive<ResourceState>({
  nodes: { total: 0, online: 0, offline: 0 },
  pods: { total: 0, running: 0, pending: 0, failed: 0, stopped: 0 },
  cpu: { total: 0, allocated: 0, percent: 0 },
  memory: { total: 0, allocated: 0, percent: 0 },
  storage: { total: 0, allocated: 0, percent: 0 },
  podCapacity: { total: 0, allocated: 0, percent: 0 },
});

const api = useStarkApi();

/* ── Formatters ── */

function formatCpu(millicores: number): string {
  if (millicores >= 1000) return `${(millicores / 1000).toFixed(1)} CPU`;
  return `${millicores}m`;
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}

/* ── Data loading ── */

async function fetchResources() {
  try {
    const [nodeResult, podResult] = await Promise.all([
      api.node.list() as Promise<{ nodes: NodeData[] }>,
      api.pod.list() as Promise<{ pods: PodData[] }>,
    ]);

    const nodes: NodeData[] = nodeResult.nodes ?? [];
    const pods: PodData[] = podResult.pods ?? [];

    // Node counts
    const online = nodes.filter((n) => n.status === 'online').length;
    resources.nodes = { total: nodes.length, online, offline: nodes.length - online };

    // Pod counts
    const running = pods.filter((p) => p.status === 'running').length;
    const pending = pods.filter((p) => ['pending', 'scheduled', 'starting'].includes(p.status)).length;
    const failed = pods.filter((p) => ['failed', 'evicted'].includes(p.status)).length;
    const stopped = pods.filter((p) => p.status === 'stopped').length;
    resources.pods = { total: pods.length, running, pending, failed, stopped };

    // Aggregate resources from all nodes
    let totalCpu = 0, allocCpu = 0;
    let totalMem = 0, allocMem = 0;
    let totalStorage = 0, allocStorage = 0;
    let totalPodCap = 0, allocPodCap = 0;

    for (const n of nodes) {
      const alloc = n.allocatable ?? { cpu: 0, memory: 0, pods: 0, storage: 0 };
      const used = n.allocated ?? { cpu: 0, memory: 0, pods: 0, storage: 0 };
      totalCpu += alloc.cpu;
      allocCpu += used.cpu;
      totalMem += alloc.memory;
      allocMem += used.memory;
      totalStorage += alloc.storage;
      allocStorage += used.storage;
      totalPodCap += alloc.pods;
      allocPodCap += used.pods;
    }

    resources.cpu = { total: totalCpu, allocated: allocCpu, percent: pct(allocCpu, totalCpu) };
    resources.memory = { total: totalMem, allocated: allocMem, percent: pct(allocMem, totalMem) };
    resources.storage = { total: totalStorage, allocated: allocStorage, percent: pct(allocStorage, totalStorage) };
    resources.podCapacity = { total: totalPodCap, allocated: allocPodCap, percent: pct(allocPodCap, totalPodCap) };

    hasData.value = true;
    errorMsg.value = '';
  } catch (err: unknown) {
    console.error('Failed to load resources:', err);
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load resources';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchResources();
  // Refresh every second
  intervalId = setInterval(fetchResources, 1000);
});

onBeforeUnmount(() => {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
});
</script>

<style scoped>
.resources-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.state-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: #94a3b8;
  font-size: 0.85rem;
  flex: 1;
}
.state-msg.error {
  flex-direction: column;
  color: #f87171;
}

/* ── Dashboard ── */
.dashboard {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.dashboard::-webkit-scrollbar {
  width: 4px;
}
.dashboard::-webkit-scrollbar-track {
  background: transparent;
}
.dashboard::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* ── Cards ── */
.resource-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.card-icon {
  font-size: 1.1rem;
}

.nodes-icon { color: #60a5fa; }
.pods-icon { color: #22c55e; }
.cpu-icon { color: #f59e0b; }
.mem-icon { color: #a78bfa; }
.storage-icon { color: #6366f1; }
.cap-icon { color: #ec4899; }

/* ── Stat row (knob + text) ── */
.stat-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stat-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-line {
  font-size: 0.8rem;
  color: #94a3b8;
}
.stat-line.success { color: #4ade80; }
.stat-line.info { color: #60a5fa; }
.stat-line.danger { color: #f87171; }
.stat-line.muted { color: #64748b; }

.stat-value {
  font-weight: 700;
  font-size: 0.9rem;
  color: #e2e8f0;
  margin-right: 4px;
}

.stat-line.success .stat-value { color: #4ade80; }
.stat-line.info .stat-value { color: #60a5fa; }
.stat-line.danger .stat-value { color: #f87171; }
.stat-line.muted .stat-value { color: #94a3b8; }

/* ── Progress bars ── */
.bar-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #94a3b8;
}

.bar-pct {
  font-weight: 700;
  color: #e2e8f0;
}

.resource-bar {
  height: 8px;
  border-radius: 4px;
}
</style>
