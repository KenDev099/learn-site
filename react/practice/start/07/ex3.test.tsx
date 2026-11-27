import { beforeEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MenuJump } from './MenuJump.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 測試環境沒有真的版面：把 scrollIntoView 換成「記下是誰被呼叫」
let scrolled: Element[] = []
beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
})

const menu = deepFreeze(structuredClone(PRODUCTS)) as readonly Product[]
type Scope = Pick<typeof screen, 'getByRole' | 'getAllByRole'>
const rowOf = (name: string, scope: Scope = screen) => scope.getAllByRole('listitem').find(li => li.textContent?.includes(name))!
const describeEl = (el: Element | null) => el?.textContent?.trim() || `<${el?.tagName.toLowerCase()}>`

async function jump(name: string, scope: Scope = screen) {
  scrolled = []
  await userEvent.setup().click(scope.getByRole('button', { name: `跳到 ${name}` }))
}
function expectJumped(name: string, scope: Scope = screen) {
  const row = rowOf(name, scope)
  expect(scrolled.map(describeEl), `按「跳到 ${name}」要對「${name}」那一列呼叫 scrollIntoView（一次）：每一列的 DOM 節點要各自記下來，用商品 id 找`).toEqual([describeEl(row)])
  expect(scrolled[0], `scrollIntoView 要呼叫在「${name}」那一列的 <li> 上`).toBe(row)
  expect(document.activeElement, `按「跳到 ${name}」後焦點要在「${name}」那一列，現在在：${describeEl(document.activeElement)}。對那一列的節點呼叫 focus()`).toBe(row)
}

describe('練習 3：MenuJump 記住列表裡每一列的 DOM 節點', () => {
  test('每個商品都能跳到自己那一列', async () => {
    render(<MenuJump products={menu} />)
    for (const p of menu) {
      await jump(p.name)
      expectJumped(p.name)
    }
  })

  test('只有一個商品也可以', async () => {
    render(<MenuJump products={[menu[3]]} />)
    await jump('伯爵紅茶')
    expectJumped('伯爵紅茶')
  })

  test('products 換了之後還是跳到正確的列', async () => {
    const view = render(<MenuJump products={menu} />)
    await jump('拿鐵')
    expectJumped('拿鐵')
    // 美式咖啡、可頌下架，順序倒過來
    const next = deepFreeze(menu.filter(p => p.id !== 1 && p.id !== 5).reverse())
    view.rerender(<MenuJump products={next} />)
    for (const p of next) {
      await jump(p.name)
      expectJumped(p.name)
    }
    // 只剩一個，再全部上架
    view.rerender(<MenuJump products={[menu[5]]} />)
    await jump('起司蛋糕')
    expectJumped('起司蛋糕')
    view.rerender(<MenuJump products={menu} />)
    for (const p of menu) {
      await jump(p.name)
      expectJumped(p.name)
    }
  })

  test('同一頁兩個 MenuJump 各自跳自己的列', async () => {
    render(<><div data-testid="a"><MenuJump products={menu} /></div><div data-testid="b"><MenuJump products={menu} /></div></>)
    const a = within(screen.getByTestId('a')), b = within(screen.getByTestId('b'))
    await jump('卡布奇諾', b)
    expectJumped('卡布奇諾', b)
    await jump('可頌', a)
    expectJumped('可頌', a)
    await jump('可頌', b)
    expectJumped('可頌', b)
  })

  test('Hook 不在迴圈裡呼叫、不在 render 過程中讀寫 ref、不關掉 lint 規則', async () => {
    const file = join(import.meta.dirname, 'MenuJump.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/refs': 'error' }), 'useRef 只能在元件最上層呼叫一次（不能放在 map 裡）：用一個 ref 放 Map，每一列用 ref callback 把自己的節點登記進去').toEqual([])
  }, 20000)
})
