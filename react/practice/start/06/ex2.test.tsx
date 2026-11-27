import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductCard } from './ProductCard.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { renderCounter } from '../../helpers/render-count.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

const product = (id: number) => deepFreeze(structuredClone(PRODUCTS.find(p => p.id === id)!))

function setup(first: Product = product(2)) {
  const onAdd = vi.fn<(productId: number) => void>()
  const notify = vi.fn<(message: string) => void>()
  const logView = vi.fn<(productId: number) => void>()
  const counter = renderCounter()
  const user = userEvent.setup()
  // fresh：模擬父元件重新 render 時用 inline 寫法傳進來的「新的函式」（logView 是穩定的）
  const ui = (p: Product, fresh = false) => (
    <counter.Profile id="card">
      <ProductCard product={p} onAdd={fresh ? id => onAdd(id) : onAdd} notify={fresh ? m => notify(m) : notify} logView={logView} />
    </counter.Profile>
  )
  const view = render(ui(first))
  return { onAdd, notify, logView, counter, user, rerender: (p: Product, fresh = false) => view.rerender(ui(p, fresh)) }
}
const add = () => screen.getByRole('button', { name: '加入' })

describe('練習 2：ProductCard 把「因為按了按鈕」的事放進事件處理函式', () => {
  test('顯示時只記錄瀏覽，不加入購物車、不通知', () => {
    const { onAdd, notify, logView } = setup()
    expect(screen.getByRole('heading')).toHaveTextContent('拿鐵 $110')
    expect(logView.mock.calls, '卡片顯示時要呼叫 logView(product.id) 一次：這是「因為顯示了」才做的事，放在 effect').toEqual([[2]])
    expect(onAdd, '客人還沒按「加入」，不能呼叫 onAdd').not.toHaveBeenCalled()
    expect(notify, '客人還沒按「加入」，不能呼叫 notify').not.toHaveBeenCalled()
  })

  test('按「加入」：呼叫 onAdd(product.id) 與 notify(已加入 品名)', async () => {
    const { onAdd, notify, logView, user } = setup(product(4))
    await user.click(add())
    expect(onAdd.mock.calls, '伯爵紅茶（id 4）按「加入」要呼叫 onAdd(4)：id 用 props.product.id').toEqual([[4]])
    expect(notify.mock.calls, '通知的文字是「已加入 品名」，品名用 props.product.name').toEqual([['已加入 伯爵紅茶']])
    expect(logView.mock.calls, '按「加入」不是「看到商品」，不能再呼叫 logView').toEqual([[4]])
  })

  test('連按三次就加入三次', async () => {
    const { onAdd, notify, user } = setup()
    await user.click(add())
    await user.click(add())
    await user.click(add())
    expect(onAdd.mock.calls, '按幾次就要加入幾次：用「added 變成 true」來觸發 effect，第二次以後 state 沒變就不會再跑').toEqual([[2], [2], [2]])
    expect(notify).toHaveBeenCalledTimes(3)
  })

  test('按「加入」不需要 state：元件不重新 render', async () => {
    const { counter, user } = setup()
    counter.reset()
    await user.click(add())
    expect(counter.commits('card'), '按「加入」之後元件重新 render 了：不要用 state 記「按過了」再讓 effect 去做事，直接在事件處理函式裡呼叫 onAdd 與 notify').toBe(0)
  })

  test('按過之後父元件重新 render（傳進新的 onAdd／notify 函式），不能再加入一次', async () => {
    const { onAdd, notify, logView, user, rerender } = setup()
    await user.click(add())
    rerender(product(2), true)
    rerender(product(2), true)
    expect(onAdd.mock.calls, '客人只按了一次，父元件重新 render 不能讓 onAdd 再被呼叫：加入購物車不是「因為 render 了」才做的事').toEqual([[2]])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(logView.mock.calls, '同一個商品重新 render，不能重複記錄瀏覽：logView 要放在有依賴陣列的 effect，不能寫在 render 過程中').toEqual([[2]])
  })

  test('換成別的商品：記錄新商品的瀏覽，但不能替客人加入', async () => {
    const { onAdd, notify, logView, user, rerender } = setup()
    await user.click(add())
    rerender(product(5))
    expect(screen.getByRole('heading')).toHaveTextContent('可頌 $70')
    expect(logView.mock.calls, '商品換了（id 不同）要再呼叫一次 logView(新的 id)：effect 的依賴要包含 product.id').toEqual([[2], [5]])
    expect(onAdd.mock.calls, '可頌沒有被按過，不能呼叫 onAdd(5)').toEqual([[2]])
    await user.click(add())
    expect(onAdd.mock.calls, '換商品之後按「加入」要用新的 product.id').toEqual([[2], [5]])
    expect(notify.mock.calls).toEqual([['已加入 拿鐵'], ['已加入 可頌']])
  })

  test('同一個商品換了新的物件（id 相同），不重複記錄瀏覽', () => {
    const { logView, rerender } = setup()
    rerender(product(2))
    rerender(product(2))
    expect(logView.mock.calls, '重新抓資料後 product 是新的物件、但還是同一個商品：依賴要寫 product.id，不要寫整個 product 物件').toEqual([[2]])
  })

  test('effect 的依賴完整，沒有用 eslint-disable', { timeout: 20_000 }, async () => {
    const file = join(import.meta.dirname, 'ProductCard.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉檢查').not.toContain('eslint-disable')
    const problems = await lintHooks(file)
    expect(problems.map(p => `第 ${p.line} 行 ${p.rule}：${p.message.split('\n')[0]}`), 'effect 裡用到的 props 都要列在依賴陣列').toEqual([])
  })
})
