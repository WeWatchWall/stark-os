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
      <!-- Summary cards row -->
      <div class="cards-row">
        <!-- Nodes card -->
        <Card class="summary-card">
          <template #title>
            <div class="card-title"><span class="card-icon nodes-icon">⎈</span> Nodes</div>
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
                textColor="#e2e8f0"
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
        <Card class="summary-card">
          <template #title>
            <div class="card-title"><span class="card-icon pods-icon">◉</span> Pods</div>
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
                textColor="#e2e8f0"
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
      </div>

      <!-- Resource graphs -->
      <div class="graphs-grid">
        <div class="graph-panel">
          <div class="graph-title"><span class="card-icon cpu-icon">⚡</span> CPU <span class="graph-subtitle">{{ formatCpu(resources.cpu.allocated) }} / {{ formatCpu(resources.cpu.total) }}</span></div>
          <Chart type="line" :data="cpuChartData" :options="chartOptions" class="resource-chart" />
        </div>

        <div class="graph-panel">
          <div class="graph-title"><span class="card-icon mem-icon">🧠</span> Memory <span class="graph-subtitle">{{ formatMemory(resources.memory.allocated) }} / {{ formatMemory(resources.memory.total) }}</span></div>
          <Chart type="line" :data="memoryChartData" :options="chartOptions" class="resource-chart" />
        </div>

        <div class="graph-panel">
          <div class="graph-title"><span class="card-icon storage-icon">💾</span> Storage <span class="graph-subtitle">{{ formatMemory(resources.storage.allocated) }} / {{ formatMemory(resources.storage.total) }}</span></div>
          <Chart type="line" :data="storageChartData" :options="chartOptions" class="resource-chart" />
        </div>

        <div class="graph-panel">
          <div class="graph-title"><span class="card-icon cap-icon">📦</span> Pod Capacity <span class="graph-subtitle">{{ resources.podCapacity.allocated }} / {{ resources.podCapacity.total }}</span></div>
          <Chart type="line" :data="podCapChartData" :options="chartOptions" class="resource-chart" />
        </div>
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

/* ── Constants ── */

const MAX_HISTORY = 60; // keep last 60 samples (60 seconds at 1s interval)

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

// Rolling history for charts
const cpuHistory = ref<number[]>([]);
const memoryHistory = ref<number[]>([]);
const storageHistory = ref<number[]>([]);
const podCapHistory = ref<number[]>([]);
const timeLabels = ref<string[]>([]);

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

function pushHistory(arr: number[], value: number) {
  arr.push(value);
  if (arr.length > MAX_HISTORY) arr.shift();
}

/* ── Chart config ── */

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  interaction: { intersect: false, mode: 'index' as const },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      callbacks: { label: (ctx: unknown) => `${(ctx as { parsed: { y: number } }).parsed.y}%` },
    },
  },
  scales: {
    x: {
      display: true,
      grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
      ticks: { display: false },
      border: { color: 'rgba(255,255,255,0.08)' },
    },
    y: {
      min: 0,
      max: 100,
      grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
      ticks: { color: '#64748b', font: { size: 10 }, callback: (v: number | string) => `${v}%` },
      border: { color: 'rgba(255,255,255,0.08)' },
    },
  },
  elements: {
    point: { radius: 0, hoverRadius: 3 },
    line: { tension: 0.3, borderWidth: 2 },
  },
};

function makeChartData(history: number[], color: string, bgColor: string) {
  return {
    labels: timeLabels.value,
    datasets: [{
      data: history,
      borderColor: color,
      backgroundColor: bgColor,
      fill: true,
    }],
  };
}

const cpuChartData = computed(() => makeChartData(cpuHistory.value, '#f59e0b', 'rgba(245,158,11,0.1)'));
const memoryChartData = computed(() => makeChartData(memoryHistory.value, '#a78bfa', 'rgba(167,139,250,0.1)'));
const storageChartData = computed(() => makeChartData(storageHistory.value, '#6366f1', 'rgba(99,102,241,0.1)'));
const podCapChartData = computed(() => makeChartData(podCapHistory.value, '#ec4899', 'rgba(236,72,153,0.1)'));

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

    // Update rolling history
    const now = new Date();
    const label = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    timeLabels.value.push(label);
    if (timeLabels.value.length > MAX_HISTORY) timeLabels.value.shift();

    pushHistory(cpuHistory.value, resources.cpu.percent);
    pushHistory(memoryHistory.value, resources.memory.percent);
    pushHistory(storageHistory.value, resources.storage.percent);
    pushHistory(podCapHistory.value, resources.podCapacity.percent);

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
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Summary cards row ── */
.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  flex-shrink: 0;
}

.summary-card {
  background: #181818 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
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

/* ── Graph panels ── */
.graphs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.graph-panel {
  background: #181818;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.graph-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
}

.graph-subtitle {
  font-weight: 400;
  font-size: 0.75rem;
  color: #64748b;
  margin-left: auto;
}

.resource-chart {
  flex: 1;
  min-height: 0;
}
</style>
