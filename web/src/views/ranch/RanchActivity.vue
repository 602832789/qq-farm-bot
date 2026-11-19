<script setup lang="ts">
import RanchActivitiesPanel from '@/components/ranch/RanchActivitiesPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'

/** 牧场活动：与农场活动中心分开，这里只有牧场侧下发的活动。 */
</script>

<template>
  <RanchSceneHost view="activities" title="牧场活动" icon="i-carbon-gift">
    <template #default="{ state, onRequest }">
      <RanchActivitiesPanel :state="state" @request="onRequest" />
    </template>
  </RanchSceneHost>
</template>
