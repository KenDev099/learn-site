import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { CartTitle } from './CartTitle.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

beforeEach(() => { document.title = '原本的標題' })

describe('練習 1：CartTitle 把購物車數量同步到 document.title', () => {
  test('掛載後標題是「(數量) 店名」，數量是 0 時只有店名', () => {
    const { unmount } = render(<CartTitle count={3} shopName="咖啡店" />)
    expect(document.title, 'count 是 3、shopName 是「咖啡店」時，document.title 要是「(3) 咖啡店」').toBe('(3) 咖啡店')
    unmount()
    render(<CartTitle count={0} shopName="咖啡店" />)
    expect(document.title, 'count 是 0 時標題只有店名，不要顯示「(0)」').toBe('咖啡店')
  })

  test('count 或 shopName 改變時，標題跟著變', () => {
    const { rerender } = render(<CartTitle count={1} shopName="咖啡店" />)
    rerender(<CartTitle count={4} shopName="咖啡店" />)
    expect(document.title, 'count 從 1 變成 4，標題要變成「(4) 咖啡店」：count 要列在依賴陣列').toBe('(4) 咖啡店')
    rerender(<CartTitle count={4} shopName="咖啡店 信義店" />)
    expect(document.title, 'shopName 換成「咖啡店 信義店」，標題要跟著變：effect 用到的 props 都要列在依賴陣列，店名也不能寫死').toBe('(4) 咖啡店 信義店')
    rerender(<CartTitle count={0} shopName="咖啡店 信義店" />)
    expect(document.title, 'count 變回 0 時標題只有店名').toBe('咖啡店 信義店')
  })

  test('count 與 shopName 都沒變時，重新 render 不再寫 document.title', () => {
    const { rerender } = render(<CartTitle count={2} shopName="咖啡店" />)
    const write = vi.spyOn(document, 'title', 'set')
    rerender(<CartTitle count={2} shopName="咖啡店" />)
    rerender(<CartTitle count={2} shopName="咖啡店" />)
    expect(write.mock.calls.length, '依賴沒變卻又寫了 document.title：useEffect 要有依賴陣列 [count, shopName]，而且不能在元件函式本體寫 document.title').toBe(0)
  })

  test('只呼叫元件函式（不跑 effect）不會改到 document.title', () => {
    // renderToString 只 render、不執行 effect：元件函式本體如果寫了 document.title，這裡就會被改掉
    const html = renderToString(<CartTitle count={9} shopName="咖啡店" />)
    expect(html, '畫面要顯示「購物車有 9 項」').toContain('9')
    expect(document.title, 'render 必須是純的：document.title 只能在 useEffect 裡寫，不能寫在元件函式本體').toBe('原本的標題')
  })

  test('通過 react-hooks 的檢查，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'CartTitle.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉檢查：把 effect 用到的值列進依賴陣列').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 檢查沒過：照訊息把缺的依賴補上').toEqual([])
  }, 20000)
})
