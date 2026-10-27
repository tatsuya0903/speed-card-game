import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'

enableAutoUnmount(afterEach)

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
