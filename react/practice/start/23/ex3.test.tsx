import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useEffect, useReducer, type ComponentType } from 'react'
import { cleanup } from '@testing-library/react'
import { createFakeMenuApi, type Product } from '../../helpers/fake-api.ts'
import { MenuPage, type MenuPageProps } from './MenuPage.tsx'
import { checkMenuPage } from './ex3.checks.tsx'

// 正確版本 B：useReducer、載入與錯誤的文字不同、錯誤和重試包在同一個區塊、清單用 <ol>、價格格式不同
// 改動旗標的預設值就是某一種錯誤版本；名稱都叫 MenuPage
function variant({
  showLoading = true, hideLoadingOnSuccess = true, alertRole = true, retryCalls = true, clearErrorOnRetry = true, allItems = true,
} = {}): ComponentType<MenuPageProps> {
  type State = { loading: boolean; failed: boolean; items: Product[] | null; attempt: number }
  type Action = { type: 'retry' } | { type: 'ok'; items: Product[] } | { type: 'fail' }
  function reducer(s: State, a: Action): State {
    switch (a.type) {
      case 'retry': return { ...s, loading: true, failed: clearErrorOnRetry ? false : s.failed, attempt: retryCalls ? s.attempt + 1 : s.attempt }
      case 'ok': return { ...s, loading: !hideLoadingOnSuccess, failed: false, items: allItems ? a.items : a.items.slice(0, 3) }
      case 'fail': return { ...s, loading: false, failed: true }
    }
  }
  return function MenuPage({ api }: MenuPageProps) {
    const [s, dispatch] = useReducer(reducer, { loading: true, failed: false, items: null, attempt: 0 })
    useEffect(() => {
      let active = true
      api.getMenu().then(items => active && dispatch({ type: 'ok', items }), () => active && dispatch({ type: 'fail' }))
      return () => { active = false }
    }, [api, s.attempt])
    return (
      <section>
        {s.loading && showLoading && <div role="status" aria-live="polite">正在讀取今天的菜單</div>}
        {s.failed && (
          <div className="error-box">
            <div {...(alertRole ? { role: 'alert' } : { className: 'error-text' })}>暫時拿不到菜單</div>
            <button onClick={() => dispatch({ type: 'retry' })}>重試</button>
          </div>
        )}
        {s.items && (
          <ol aria-label="菜單">
            {s.items.map(p => <li key={p.id}><span>{p.name}</span><span>{p.price} 元</span></li>)}
          </ol>
        )}
      </section>
    )
  }
}

const WRONG: [string, ComponentType<MenuPageProps>][] = [
  ['等待時沒有載入訊息', variant({ showLoading: false })],
  ['成功之後載入訊息還在', variant({ hideLoadingOnSuccess: false })],
  ['錯誤訊息沒有 role="alert"', variant({ alertRole: false })],
  ['按重試不會再呼叫 API（一直載入中）', variant({ retryCalls: false })],
  ['按重試之後錯誤訊息還在', variant({ clearErrorOnRetry: false })],
  ['只列出前 3 個商品', variant({ allItems: false })],
]

const makeApi = () => createFakeMenuApi({ manual: true })

async function run(Page: ComponentType<MenuPageProps>) {
  try {
    await checkMenuPage(Page, makeApi)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  } finally {
    cleanup()
  }
}

describe('練習 3：菜單頁的檢查', () => {
  test('正確版本 A（MenuPage.tsx）要通過', async () => {
    const error = await run(MenuPage)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}。讓假 API 完成之後，畫面要等 React 更新：用 findBy… 等它出現`).toBeNull()
  })

  test('正確版本 B（文字、標記都不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。載入、錯誤的文字不固定，用 role 找；商品只保證是清單項目裡有品名`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Page) => {
    const error = await run(Page)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })

  test('不用 setTimeout 等待', () => {
    const code = readFileSync(join(import.meta.dirname, 'ex3.checks.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/setTimeout|setInterval/.test(code), '用計時器等 API：慢的機器上不夠、快的機器上浪費。讓假 API 完成後用 findBy… 等畫面出現').toBe(false)
  })
})
