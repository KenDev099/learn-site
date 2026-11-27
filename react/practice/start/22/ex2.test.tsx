import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { within } from '@testing-library/react'
import { PhoneField } from './PhoneField.tsx'
import { hydrate, serverRender, summary } from './ssr-utils.tsx'

function Checkout() {
  return (
    <form aria-label="結帳">
      <PhoneField label="訂購人電話" />
      <PhoneField label="取件人電話" />
      <PhoneField label="取件人電話" />
    </form>
  )
}
function OtherPage() {
  return <main><PhoneField label="會員電話" /><PhoneField label="緊急聯絡電話" /></main>
}
const ids = (root: ParentNode) => [...root.querySelectorAll('input')].map(i => i.id)

describe('練習 2：PhoneField 的 id', () => {
  test('label、說明文字都連得到 input，同一頁不重複', async () => {
    const { container } = await hydrate(serverRender(<Checkout />), <Checkout />)
    const inputs = within(container).getAllByLabelText(/電話/)
    expect(inputs, '三個欄位都要用 <label htmlFor> 連到自己的 input').toHaveLength(3)
    const list = ids(container)
    expect(new Set(list).size, `同一頁三個 PhoneField 的 id 重複了（${list.join('、')}）：寫死的 id 或用 label 組出來的 id，放兩個一樣的欄位就撞在一起`).toBe(3)
    for (const input of inputs) {
      expect(input, 'input 的 aria-describedby 要連到「格式：0912-345-678」').toHaveAccessibleDescription('格式：0912-345-678')
    }
  })

  test('hydration 後的 id 和伺服器的 HTML 一樣，沒有錯誤', async () => {
    const html = serverRender(<Checkout />)
    const serverIds = ids(Object.assign(document.createElement('div'), { innerHTML: html }))
    const { container, ...report } = await hydrate(html, <Checkout />)
    expect(summary(report), '有 hydration 錯誤：id 在伺服器和瀏覽器各算一次，兩邊要一樣。用 useId()，不要用 Math.random()').toBe('')
    expect(ids(container), 'hydration 後的 id 要和伺服器 HTML 裡的一樣').toEqual(serverIds)
  })

  test('伺服器先渲染過別的頁面，這一頁還是一致', async () => {
    serverRender(<OtherPage />)
    serverRender(<OtherPage />)
    const html = serverRender(<Checkout />)
    const serverIds = ids(Object.assign(document.createElement('div'), { innerHTML: html }))
    const { container, ...report } = await hydrate(html, <Checkout />)
    expect(summary(report), '伺服器渲染過別的頁面之後就不一致了：模組層級的計數器在伺服器上被所有請求共用，瀏覽器卻從頭數。用 useId()，它依元件在樹裡的位置產生').toBe('')
    expect(ids(container)).toEqual(serverIds)
  })

  test('props 只有 label，沒有用亂數', () => {
    const source = readFileSync(join(import.meta.dirname, 'PhoneField.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(source, '不要用 Math.random()、crypto.randomUUID() 產生 id：伺服器和瀏覽器各算一次，一定不同').not.toMatch(/Math\.random|randomUUID/)
    expect(source, 'suppressHydrationWarning 只讓警告閉嘴，id 還是不同、label 還是連不到').not.toContain('suppressHydrationWarning')
  })
})
