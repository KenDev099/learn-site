import { describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { PRODUCTS, createFakeMenuApi } from '../../helpers/fake-api.ts'

// ── 邊界檢查：用 fs 讀出 src 裡每個 .ts／.vue 的 import，畫成依賴圖再檢查規則 ──
const SRC = join(import.meta.dirname, 'src')
const files = readdirSync(SRC, { recursive: true }).map(String)
  .filter(f => /\.(ts|vue)$/.test(f)).map(f => join(SRC, f))
const rel = (f: string) => relative(SRC, f).split(sep).join('/')
// 去掉註解：檔案開頭的說明會提到 fetch、import，不算
const strip = (code: string) => code
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const code = new Map(files.map(f => [f, strip(readFileSync(f, 'utf8'))]))
// from '…'、import '…'、import('…')
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g
// '../cart'、'../cart/index' 這種省略寫法也解析到實際的檔案，依賴圖才不會漏掉
const toFile = (p: string) => [p, p + '.ts', p + '.vue', join(p, 'index.ts')].find(c => code.has(c)) ?? p
const edges = new Map(files.map(f => [f,
  [...code.get(f)!.matchAll(IMPORT)].map(m => m[1]!)
    .filter(s => s.startsWith('.'))
    .map(s => toFile(resolve(dirname(f), s))),
]))

const RANK: Record<string, number> = { shared: 0, features: 1, pages: 2, app: 3 }
const layer = (f: string) => rel(f).split('/')[0]!
const feature = (f: string) => (layer(f) === 'features' ? rel(f).split('/')[1] : undefined)

describe('練習 1：模組邊界與依賴方向', () => {
  test('依賴只能往下：app → pages → features → shared（shared 不能 import features）', () => {
    const bad: string[] = []
    for (const [from, tos] of edges) for (const to of tos) {
      if ((RANK[layer(to)] ?? 0) > (RANK[layer(from)] ?? 0)) bad.push(`${rel(from)} → ${rel(to)}`)
    }
    expect(bad, '這些 import 往上依賴了：shared 不能知道 features，features 不能知道 pages。把需要的資訊改成參數或 props 從上面傳下來：\n' + bad.join('\n')).toEqual([])
  })

  test('feature 外面的程式只能 import 那個 feature 的 index.ts', () => {
    const bad: string[] = []
    for (const [from, tos] of edges) for (const to of tos) {
      const f = feature(to)
      if (f && feature(from) !== f && rel(to) !== `features/${f}/index.ts`) bad.push(`${rel(from)} → ${rel(to)}`)
    }
    expect(bad, '這些是深層 import（直接拿別的 feature 的內部檔案）：改成 import 那個 feature 的 index.ts，需要的東西在 index.ts 公開：\n' + bad.join('\n')).toEqual([])
  })

  test('沒有循環依賴', () => {
    const state = new Map<string, 'visiting' | 'done'>()
    const cycles: string[] = []
    const visit = (f: string, path: string[]) => {
      if (state.get(f) === 'done') return
      if (state.get(f) === 'visiting') {
        cycles.push([...path.slice(path.indexOf(f)), f].map(rel).join(' → '))
        return
      }
      state.set(f, 'visiting')
      for (const to of edges.get(f) ?? []) visit(to, [...path, f])
      state.set(f, 'done')
    }
    for (const f of files) visit(f, [])
    expect(cycles, '有檔案互相 import（循環依賴）：把兩邊都需要的通用程式移到更底層（例如 shared/lib），讓依賴只往一個方向：\n' + cycles.join('\n')).toEqual([])
  })

  test('只有 shared/api 呼叫 fetch；shared 裡沒有 store', () => {
    const fetchOutside = files.filter(f => !rel(f).startsWith('shared/api/') && /\bfetch\s*\(/.test(code.get(f)!)).map(rel)
    expect(fetchOutside, '這些檔案直接呼叫 fetch：元件和 store 改用 useMenuApi() 拿注入的 client，fetch 只寫在 shared/api：\n' + fetchOutside.join('\n')).toEqual([])
    const storesInShared = files.filter(f => layer(f) === 'shared' && /\bdefineStore\b/.test(code.get(f)!)).map(rel)
    expect(storesInShared, 'shared 裡出現 defineStore：store 是某個 feature 的狀態，放回 features/<名稱>/，不要把邏輯都搬進 shared：\n' + storesInShared.join('\n')).toEqual([])
  })

  test('features/cart/index.ts 公開 useCartStore 與 CartBadge', async () => {
    const cart: Record<string, unknown> = await import('./src/features/cart/index.ts')
    expect(typeof cart.useCartStore, 'cart 的 index.ts 要 export useCartStore').toBe('function')
    expect(cart.CartBadge, "cart 的 index.ts 要 export CartBadge：export { default as CartBadge } from './CartBadge.vue'").toBeTruthy()
  })

  test('shared/ui 的 BaseButton 只看 disabled prop，不知道登入狀態', async () => {
    const { default: BaseButton } = await import('./src/shared/ui/BaseButton.vue')
    // 單獨掛載、沒有 Pinia：設計系統的元件要在任何專案都能用
    const enabled = mount(BaseButton, { props: { disabled: false }, slots: { default: '加入' } })
    expect(enabled.find('button').element.disabled, 'disabled 是 false 時按鈕要可以按：BaseButton 不能自己去讀登入狀態（不論 import auth 還是直接讀 Pinia）').toBe(false)
    await enabled.find('button').trigger('click')
    expect(enabled.emitted('click'), '按下去要能觸發 click').toBeTruthy()
    const disabled = mount(BaseButton, { props: { disabled: true }, slots: { default: '加入' } })
    expect(disabled.find('button').element.disabled, 'disabled 是 true 時按鈕要停用：用 :disabled="disabled" 綁到 <button>').toBe(true)
  })

  test('shared/api 的 createHttpMenuApi 用 fetch 取菜單，非 2xx 丟錯', async () => {
    const { createHttpMenuApi } = await import('./src/shared/api/menu-api.ts')
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(PRODUCTS), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const menu = await createHttpMenuApi('https://api.coffee.example').getMenu({ signal })
    expect(menu, 'getMenu 要回傳解析後的 JSON').toEqual(PRODUCTS)
    expect(fetchMock.mock.calls[0]?.[0], '網址要是 `${baseUrl}/menu`').toBe('https://api.coffee.example/menu')
    expect(fetchMock.mock.calls[0]?.[1], '要把 signal 傳給 fetch，才能取消請求').toMatchObject({ signal })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    await expect(createHttpMenuApi('https://api.coffee.example').getMenu(), '回應不是 2xx 要丟錯，訊息帶狀態碼').rejects.toThrow(/503/)
  })

  test('功能不變：菜單從注入的 API 來，登入後才能加入，徽章跟著變', async () => {
    // 全域 fetch 一被呼叫就丟錯：資料只能從 createRootApp(api) 注入的 client 取得
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('元件不能直接呼叫 fetch') }))
    const { createRootApp } = await import('./src/app/main.ts')
    // 起始的 index.ts 是空殼，先標成 cart-store 的型別，執行時才知道有沒有公開
    const { useCartStore } = (await import('./src/features/cart/index.ts')) as typeof import('./src/features/cart/cart-store.ts')
    const { useSession } = await import('./src/features/auth/index.ts')
    const api = createFakeMenuApi()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = createRootApp(api)
    const root = document.createElement('div')
    document.body.append(root)
    app.mount(root)
    try {
      await flushPromises()
      expect(api.callsOf('getMenu').length, '菜單要透過注入的 API client 取得：createRootApp 要 app.provide(MENU_API, api)，MenuList 用 useMenuApi().getMenu()').toBe(1)
      for (const p of PRODUCTS) expect(root.textContent, `菜單要顯示 ${p.name}`).toContain(p.name)

      const buttons = [...root.querySelectorAll('button')]
      expect(buttons.length, '每個商品一顆「加入」按鈕').toBe(PRODUCTS.length)
      expect(buttons.every(b => b.disabled), '還沒登入時「加入」要停用：MenuList 判斷登入狀態，用 :disabled 傳給 BaseButton').toBe(true)

      useSession().login('王小明')
      await nextTick()
      expect(buttons.some(b => b.disabled), '登入之後「加入」要可以按').toBe(false)

      buttons[1]!.click()
      buttons[1]!.click()
      await nextTick()
      expect(useCartStore().count, '按兩次拿鐵的「加入」，購物車要有 2 件').toBe(2)
      expect(root.textContent, '頁首的徽章要顯示「購物車 2 件 · 220 元」').toContain('購物車 2 件 · 220 元')
    } finally {
      app.unmount()
    }
  })
})
