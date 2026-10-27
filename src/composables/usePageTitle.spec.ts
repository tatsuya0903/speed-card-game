import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePageTitle } from './usePageTitle'

describe('usePageTitle', () => {
  const originalTitle = document.title
  afterEach(() => {
    document.title = originalTitle
  })

  it('VueUseでページ名を反映し、変更に追従し、スコープ終了後は追従を止める', async () => {
    const pageTitle = ref('ホーム')
    const scope = effectScope()
    try {
      scope.run(() => usePageTitle(pageTitle))
      await nextTick()
      expect(document.title).toBe('ホーム | Speed Card Game')

      pageTitle.value = 'ページが見つかりません'
      await nextTick()
      expect(document.title).toBe('ページが見つかりません | Speed Card Game')

      scope.stop()
      const stoppedTitle = document.title
      pageTitle.value = '終了後'
      await nextTick()
      expect(document.title).toBe(stoppedTitle)
    } finally {
      scope.stop()
    }
  })
})
