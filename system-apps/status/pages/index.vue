<template>
  <div class="status-page">
    <Toast position="top-right" />
    <Tabs :value="activeTab" @update:value="activeTab = $event" class="status-tabs">
      <TabList>
        <Tab value="pods">Pods</Tab>
        <Tab value="resources">Resources</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="pods">
          <PodsTab />
        </TabPanel>
        <TabPanel value="resources">
          <ResourcesTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PodsTab from '../components/PodsTab.vue';
import ResourcesTab from '../components/ResourcesTab.vue';

const activeTab = ref('pods');
</script>

<style scoped>
.status-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

.status-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.status-tabs :deep(.p-tabpanels) {
  flex: 1;
  min-height: 0;
  padding: 0;
}

.status-tabs :deep(.p-tabpanel) {
  height: 100%;
  overflow: hidden;
}
</style>
