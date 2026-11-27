import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { hydrate, serverRender } from '../../helpers/ssr.ts'
import StoreHours from './StoreHours.vue'

// 台北時間 = UTC+8（台灣沒有日光節約時間）
const taipei = (hour: number, minute = 0) => Date.UTC(2026, 9, 31, hour - 8, minute)
const originalTZ = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTZ
})

// 伺服器在 UTC、晚上 11 點（台北時間）；瀏覽器在紐約、隔天下午
async function renderOnServer(now: number) {
  process.env.TZ = 'UTC'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(taipei(23))
  try {
    return await serverRender(StoreHours, { now })
  } finally {
    vi.useRealTimers()
  }
}

function hydrateInBrowser(html: string, now: number) {
  process.env.TZ = 'America/New_York'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(taipei(38))
  try {
    return hydrate(html, StoreHours, { now })
  } finally {
    vi.useRealTimers()
  }
}

const status = (html: string) => /<p class="status">([^<]*)<\/p>/.exec(html)?.[1]

describe('練習 1：StoreHours 能在伺服器渲染', () => {
  test('沒有 window、document 也能渲染', async () => {
    await expect(renderOnServer(taipei(10)), 'setup 不能直接讀 window：寬度改成 ref(null)，在 onMounted 裡才讀 window.innerWidth').resolves.toContain('營業時間')
  })

  test('營業狀態由 props.now 的台北時間決定', async () => {
    expect(status(await renderOnServer(taipei(10))), '台北 10:00 要顯示「營業中」：用 props.now 算，不要用 new Date()；小時要用 Asia/Taipei 時區算，不能用 getHours()（伺服器在 UTC）').toBe('營業中')
    expect(status(await renderOnServer(taipei(7))), '台北 07:00 要顯示「營業中」（07:00 含）').toBe('營業中')
    expect(status(await renderOnServer(taipei(18, 59))), '台北 18:59 要顯示「營業中」').toBe('營業中')
    expect(status(await renderOnServer(taipei(19))), '台北 19:00 要顯示「休息中」（19:00 不含）').toBe('休息中')
    expect(status(await renderOnServer(taipei(6, 59))), '台北 06:59 要顯示「休息中」').toBe('休息中')
    expect(status(await renderOnServer(taipei(24))), '台北 00:00 要顯示「休息中」').toBe('休息中')
  })

  test('伺服器的 HTML 不顯示寬度，也不用 data-allow-mismatch', async () => {
    const html = await renderOnServer(taipei(10))
    expect(html, '伺服器上還不知道螢幕寬度，掛載之前不要顯示「螢幕寬度」').not.toContain('螢幕寬度')
    expect(html, '不要用 data-allow-mismatch 蓋掉不一致，要讓兩邊算出一樣的畫面').not.toContain('data-allow-mismatch')
  })
})

describe('練習 1：hydration 沒有不一致', () => {
  test('同一個 now，瀏覽器換了時間和時區也沒有警告', async () => {
    const now = taipei(10)
    const html = await renderOnServer(now)
    const { container, warnings } = hydrateInBrowser(html, now)
    expect(warnings, '有 hydration 警告：第一次渲染的結果要和伺服器一樣。不要在 setup 用 typeof window 判斷後輸出不同內容，寬度在 onMounted 才讀').toEqual([])
    expect(container.querySelector('.status')?.textContent, 'hydrate 後仍要顯示「營業中」').toBe('營業中')
  })

  test('掛載之後顯示螢幕寬度', async () => {
    const now = taipei(21)
    const html = await renderOnServer(now)
    const { container, warnings } = hydrateInBrowser(html, now)
    await nextTick()
    expect(warnings, '不能有 hydration 警告').toEqual([])
    expect(container.querySelector('.width')?.textContent, '掛載後要在 onMounted 讀 window.innerWidth，顯示「螢幕寬度：1024px」').toBe(`螢幕寬度：${window.innerWidth}px`)
    expect(container.querySelector('.status')?.textContent, '台北 21:00 要顯示「休息中」').toBe('休息中')
  })
})
