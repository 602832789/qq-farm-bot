<script setup lang="ts">
import { computed, ref } from 'vue'
import RanchFriendsPanel from '@/components/ranch/RanchFriendsPanel.vue'
import RanchSceneHost from '@/components/ranch/RanchSceneHost.vue'

/** 牧场好友：从好友列表进别人的牧场时带 gid，场景壳按它重新读取对方的栏舍。 */
const hostGid = ref('')
const params = computed(() => (hostGid.value ? { hostGid: hostGid.value } : {}))
</script>

<template>
  <RanchSceneHost view="friends" :params="params" title="好友牧场" icon="i-carbon-user-multiple">
    <template #default="{ state, onRequest }">
      <RanchFriendsPanel :state="state" @request="onRequest" @host-gid="hostGid = $event" />
    </template>
  </RanchSceneHost>
</template>
