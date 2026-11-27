import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { StoreBanner } from './StoreBanner.tsx'
import { hydrate, serverRender, summary } from './ssr-utils.tsx'

// 台北時間 = UTC+8（台灣沒有日光節約時間）
const taipei = (hour: number, minute = 0) => Date.UTC(2026, 10, 14, hour - 8, minute)
const originalTZ = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTZ
  vi.useRealTimers()
})

// 伺服器在 UTC，系統時間是台北晚上 11 點；瀏覽器在紐約，系統時間是隔天下午 2 點
function renderOnServer(now: number) {
  process.env.TZ = 'UTC'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(taipei(23))
  try {
    return serverRender(<StoreBanner now={now} />)
  } finally {
    vi.useRealTimers()
  }
}
async function hydrateInBrowser(html: string, now: number) {
  process.env.TZ = 'America/New_York'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(taipei(38))
  try {
    return await hydrate(html, <StoreBanner now={now} />)
  } finally {
    vi.useRealTimers()
  }
}
const status = (html: string) => /<p class="status">([^<]*)<\/p>/.exec(html)?.[1]

describe('練習 1：StoreBanner 能在伺服器 render', () => {
  test('沒有 window 也能 render', () => {
    expect(() => renderOnServer(taipei(10)), 'render 時不能直接讀 window：伺服器上沒有 window。寬度改成 hydration 之後才讀').not.toThrow()
    expect(renderOnServer(taipei(10))).toContain('豆留咖啡 總店')
  })

  test('營業狀態由 props.now 的台北時間決定', () => {
    expect(status(renderOnServer(taipei(10))), '台北 10:00 要顯示「營業中」：用 props.now 算，不要用 new Date()；小時要指定 Asia/Taipei 時區，不能用 getHours()（伺服器在 UTC）').toBe('營業中')
    expect(status(renderOnServer(taipei(7))), '台北 07:00 要顯示「營業中」（07:00 含）').toBe('營業中')
    expect(status(renderOnServer(taipei(18, 59))), '台北 18:59 要顯示「營業中」').toBe('營業中')
    expect(status(renderOnServer(taipei(19))), '台北 19:00 要顯示「休息中」（19:00 不含）').toBe('休息中')
    expect(status(renderOnServer(taipei(6, 59))), '台北 06:59 要顯示「休息中」').toBe('休息中')
    expect(status(renderOnServer(taipei(24))), '台北 00:00 要顯示「休息中」').toBe('休息中')
  })

  test('伺服器的 HTML 不顯示寬度', () => {
    expect(renderOnServer(taipei(10)), '伺服器還不知道螢幕寬度，HTML 裡不要有「螢幕寬度」').not.toContain('螢幕寬度')
  })
})

describe('練習 1：hydration 沒有不一致', () => {
  test('同一個 now，瀏覽器換了時間和時區也沒有 hydration 錯誤', async () => {
    const now = taipei(10)
    const { container, ...report } = await hydrateInBrowser(renderOnServer(now), now)
    expect(summary(report), '有 hydration 錯誤：瀏覽器第一次 render 要和伺服器的 HTML 一樣。不要用 typeof window 在 render 裡分支；寬度在 hydration 之後才讀').toBe('')
    expect(container.querySelector('.status')?.textContent, 'hydration 後仍要顯示「營業中」').toBe('營業中')
  })

  test('hydration 之後顯示螢幕寬度', async () => {
    const now = taipei(21)
    const { container, ...report } = await hydrateInBrowser(renderOnServer(now), now)
    expect(summary(report), '不能有 hydration 錯誤').toBe('')
    expect(container.querySelector('.width')?.textContent, 'hydration 之後要顯示「螢幕寬度：1024px」：用 useEffect 或 useSyncExternalStore（getServerSnapshot 回傳 null）').toBe(`螢幕寬度：${window.innerWidth}px`)
    expect(container.querySelector('.status')?.textContent, '台北 21:00 要顯示「休息中」').toBe('休息中')
  })

  test('沒有用 suppressHydrationWarning', () => {
    const source = readFileSync(join(import.meta.dirname, 'StoreBanner.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(source, 'suppressHydrationWarning 只讓警告閉嘴，React 也不會修正文字：要讓兩邊算出一樣的畫面').not.toContain('suppressHydrationWarning')
  })
})
