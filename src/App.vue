<script setup lang="ts">
import { useRoute } from 'vue-router'
import { usePageTitle } from '@/composables/usePageTitle'

const route = useRoute()
usePageTitle(() => route.meta.title ?? 'ホーム')
</script>

<template>
  <v-app>
    <v-main>
      <v-container class="app-shell py-10 py-sm-16">
        <header class="mb-8">
          <p class="brand">Speed Card Game</p>
        </header>
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
