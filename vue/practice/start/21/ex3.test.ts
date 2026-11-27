import { describe, expect, test, vi } from 'vitest'
import type { PreloadDeps } from './preload-error.ts'

// 模擬重新整理：重新 import 模組，模組裡的變數全部重來；storage 沿用同一個
async function freshPage() {
  vi.resetModules()
  return (await import('./preload-error.ts')).handlePreloadError
}

function memoryStorage() {
  const map = new Map<string, string>()
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, String(v)) } }
}

function preloadError() {
  const e = new Event('vite:preloadError', { cancelable: true })
  return Object.assign(e, { payload: new Error('Failed to fetch dynamically imported module: /assets/Checkout-3f9a.js') })
}

function deps(storage: PreloadDeps['storage'], time: { now: number }) {
  return { storage, reload: vi.fn(), now: () => time.now }
}

describe('練習 3：chunk 載入失敗時重新整理一次', () => {
  test('第一次：preventDefault、在 storage 記下時間、reload', async () => {
    const storage = memoryStorage()
    const time = { now: 1_000_000 }
    const d = deps(storage, time)
    const event = preloadError()
    ;(await freshPage())(event, d)
    expect(d.reload, '第一次發生要 reload()，載入新版的 HTML').toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented, '要呼叫 event.preventDefault()，Vite 才不會再把錯誤丟出來').toBe(true)
    expect([...storage.map.values()], 'reload 之前要把 now() 的時間存進 storage（重新整理之後只剩 storage 記得）').toContain('1000000')
  })

  test('重新整理後 10 秒內又失敗：不再 reload，讓錯誤丟出', async () => {
    const storage = memoryStorage()
    const time = { now: 1_000_000 }
    ;(await freshPage())(preloadError(), deps(storage, time))
    time.now += 3_000
    const d = deps(storage, time)
    const event = preloadError()
    ;(await freshPage())(event, d)
    expect(d.reload, '10 秒內又發生，代表重新整理也沒用（例如 CDN 還沒更新完）：不要再 reload，否則會無限重新整理。時間要記在 storage，模組變數在重新整理後就不見了').not.toHaveBeenCalled()
    expect(event.defaultPrevented, '不 reload 的時候不要 preventDefault，讓錯誤照常丟出、由錯誤畫面處理').toBe(false)
  })

  test('超過 10 秒之後又失敗：再重新整理一次', async () => {
    const storage = memoryStorage()
    const time = { now: 1_000_000 }
    ;(await freshPage())(preloadError(), deps(storage, time))
    time.now += 10_000
    const d = deps(storage, time)
    const event = preloadError()
    ;(await freshPage())(event, d)
    expect(d.reload, '距離上次重新整理已經 10 秒，可能是又部署了一次：要再 reload').toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    time.now += 2_000
    const d2 = deps(storage, time)
    ;(await freshPage())(preloadError(), d2)
    expect(d2.reload, '每次 reload 都要更新 storage 裡的時間').not.toHaveBeenCalled()
  })

  test('storage 不能用：不 reload、不 preventDefault', async () => {
    const broken = {
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('denied', 'SecurityError') },
    }
    const d = deps(broken, { now: 1_000_000 })
    const event = preloadError()
    ;(await freshPage())(event, d)
    expect(d.reload, 'storage 讀寫丟錯時記不住時間，reload 可能變成無限重新整理：用 try/catch 包住，出錯就不 reload').not.toHaveBeenCalled()
    expect(event.defaultPrevented, 'storage 不能用時不要 preventDefault').toBe(false)
  })

  test('storage 讀得到但寫不進去：不 reload、不 preventDefault', async () => {
    const readOnly = {
      getItem: () => null,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError') },
    }
    const d = deps(readOnly, { now: 1_000_000 })
    const event = preloadError()
    ;(await freshPage())(event, d)
    expect(d.reload, '時間寫不進 storage，重新整理後就不知道剛 reload 過，會無限重新整理：setItem 失敗也不能 reload').not.toHaveBeenCalled()
    expect(event.defaultPrevented, 'setItem 失敗時不要 preventDefault').toBe(false)
  })
})
