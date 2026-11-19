<script setup lang="ts">
import RanchIllustratedPanel from '@/components/ranch/RanchIllustratedPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'

/** 牧场图鉴：牧场侧的收集进度与奖励领取，和农场图鉴是两套数据。 */
</script>

<template>
  <RanchSceneHost view="illustrated" title="牧场图鉴" icon="i-carbon-book">
    <template #default="{ state, onRequest }">
      <RanchIllustratedPanel :state="state" @request="onRequest" />
    </template>
  </RanchSceneHost>
</template>
