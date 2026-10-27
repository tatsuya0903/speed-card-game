import { useTitle } from '@vueuse/core'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

export function usePageTitle(pageTitle: MaybeRefOrGetter<string>) {
  return useTitle(computed(() => `${toValue(pageTitle)} | Speed Card Game`))
}
