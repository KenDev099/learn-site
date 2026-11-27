// 每個測試檔都會先載入：測試結束時卸載元件、還原計時器、清空 body；並加上 toBeInTheDocument 這類 DOM 斷言
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  if (typeof document !== 'undefined') document.body.innerHTML = ''
})
