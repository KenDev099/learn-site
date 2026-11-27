// 每個測試檔都會先載入：測試結束時卸載元件、還原計時器、清空 body
import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  if (typeof document !== 'undefined') document.body.innerHTML = ''
})
