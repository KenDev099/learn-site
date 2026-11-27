import { describe, expect, test } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from './routes.tsx'

function setup(path = '/menu') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<StrictMode><RouterProvider router={router} /></StrictMode>)
  return { user: userEvent.setup(), router }
}

const heading = () => screen.getByRole('heading', { level: 1 })

describe('練習 2：換頁之後的分頁標題與焦點', () => {
  test('每一頁用 <title> 設定分頁標題', async () => {
    const { user } = setup()
    expect(heading()).toHaveTextContent('菜單')
    expect(document.title, '分頁標題要是「{title}｜好咖啡」').toBe('菜單｜好咖啡')
    await user.click(screen.getByRole('link', { name: '購物車' }))
    expect(heading()).toHaveTextContent('購物車')
    expect(document.title, '換頁之後分頁標題跟著換').toBe('購物車｜好咖啡')
    expect(document.head.querySelectorAll('title').length, '同時只能有一個 <title>').toBe(1)
  })

  test('h1 可以被程式聚焦，但不在 Tab 順序裡', () => {
    setup()
    expect(heading(), 'h1 要加 tabIndex={-1}：程式能聚焦、按 Tab 不會停在它上面').toHaveAttribute('tabindex', '-1')
  })

  test('第一次載入不移動焦點', () => {
    setup()
    expect(heading(), '剛打開頁面時不要把焦點搶到 h1（StrictMode 會把 effect 多跑一次，也不能因此移動）').not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
  })

  test('點連結換頁後，焦點移到新頁面的 h1', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('link', { name: '購物車' }))
    expect(heading()).toHaveTextContent('購物車')
    expect(heading(), '換頁之後焦點要在新頁面的 h1，讀螢幕軟體才會唸出新頁面').toHaveFocus()
    await user.click(screen.getByRole('link', { name: '菜單' }))
    expect(heading()).toHaveTextContent('菜單')
    expect(heading(), '每次換頁都要移動').toHaveFocus()
  })

  test('只改搜尋參數時焦點留在搜尋框', async () => {
    const { user, router } = setup()
    const input = screen.getByRole('textbox', { name: '搜尋品名' })
    await user.click(input)
    await user.keyboard('拿鐵')
    expect(router.state.location.search).toBe('?q=%E6%8B%BF%E9%90%B5')
    expect(screen.getByRole('textbox', { name: '搜尋品名' }), '同一頁只改了 ?q=，焦點不能被搶到 h1：比較的是 pathname').toHaveFocus()
    expect(screen.getByRole('textbox', { name: '搜尋品名' })).toHaveValue('拿鐵')
  })
})
