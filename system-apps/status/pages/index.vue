<template>
  <div class="status-page">
    <Toast position="top-right" />
    <Tabs :value="activeTab" @update:value="activeTab = $event" class="status-tabs">
      <TabList>
        <Tab value="pods">Pods</Tab>
        <Tab value="resources">Resources</Tab>
        <Tab value="events">Events</Tab>
        <Tab value="services">Services</Tab>
        <Tab value="volumes">Volumes</Tab>
        <Tab value="policies">Network</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="pods">
          <PodsTab />
        </TabPanel>
        <TabPanel value="resources">
          <ResourcesTab />
        </TabPanel>
        <TabPanel value="events">
          <EventsTab />
        </TabPanel>
        <TabPanel value="services">
          <ServicesTab />
        </TabPanel>
        <TabPanel value="volumes">
          <VolumesTab />
        </TabPanel>
        <TabPanel value="policies">
          <NetworkPoliciesTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PodsTab from '../components/PodsTab.vue';
import ResourcesTab from '../components/ResourcesTab.vue';
import EventsTab from '../components/EventsTab.vue';
import ServicesTab from '../components/ServicesTab.vue';
import VolumesTab from '../components/VolumesTab.vue';
import NetworkPoliciesTab from '../components/NetworkPoliciesTab.vue';

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

/* Mobile: make tabs scrollable */
@media (max-width: 640px) {
  .status-tabs :deep(.p-tablist) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .status-tabs :deep(.p-tab) {
    white-space: nowrap;
    font-size: 0.85rem;
    padding: 8px 12px;
  }
}
</style>
