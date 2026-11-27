import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { BaseButton } from './BaseButton.tsx'

const classes = (el: HTMLElement) => [...el.classList].sort()

describe('練習 5：BaseButton 把沒用到的 props 透傳到 <button>', () => {
  test('aria-label、data-*、id、onClick 都落在 <button> 上', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<BaseButton aria-label="移除可頌" data-track="remove" id="remove-5" title="移除" onClick={onClick}>×</BaseButton>)
    const button = screen.getByRole('button', { name: '移除可頌' })
    expect(button, 'children 也是 props 的一部分，要照樣顯示').toHaveTextContent('×')
    expect(button, '沒有列在元件參數裡的 props 用 ...rest 收起來，再 {...rest} 展開到 <button>：不要一個一個挑').toHaveAttribute('data-track', 'remove')
    expect(button).toHaveAttribute('id', 'remove-5')
    expect(button).toHaveAttribute('title', '移除')
    await user.click(button)
    expect(onClick, 'onClick 也在 rest 裡，要交給 <button>').toHaveBeenCalledTimes(1)
  })

  test('ref 也會透傳到 <button>', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<BaseButton ref={ref}>結帳</BaseButton>)
    expect(ref.current, 'React 19 的 ref 是一般的 prop（第 7 課）：留在 rest 裡展開到 <button> 就接上了').toBe(screen.getByRole('button', { name: '結帳' }))
  })

  test('className 合併：btn、btn-<variant> 與傳進來的都要在', () => {
    render(<><BaseButton className="wide mt-2">結帳</BaseButton><BaseButton variant="ghost" className="wide">取消</BaseButton></>)
    expect(classes(screen.getByRole('button', { name: '結帳' })), '傳進來的 className 不能蓋掉 btn，btn 也不能蓋掉傳進來的：把 className 從 props 解構出來，自己組成一個字串。variant 預設是 primary').toEqual(['btn', 'btn-primary', 'mt-2', 'wide'])
    expect(classes(screen.getByRole('button', { name: '取消' }))).toEqual(['btn', 'btn-ghost', 'wide'])
  })

  test('沒傳 className 時，class 只有 btn 與 btn-<variant>', () => {
    render(<BaseButton>結帳</BaseButton>)
    expect(screen.getByRole('button', { name: '結帳' }).className, 'className 沒傳時是 undefined：直接放進樣板字串會變成 "btn btn-primary undefined"，要先濾掉').toBe('btn btn-primary')
  })

  test('type 預設是 button，可以被 type="submit" 蓋過', () => {
    render(<><BaseButton>取消</BaseButton><BaseButton type="submit">送出訂單</BaseButton></>)
    expect(screen.getByRole('button', { name: '取消' }), '預設 type="button"：<form> 裡沒寫 type 的 <button> 會送出表單').toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: '送出訂單' }), '預設值寫在 {...rest} 前面，使用的人傳的值才蓋得過去').toHaveAttribute('type', 'submit')
  })

  test('variant、loading 不能出現在 DOM 上', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<><BaseButton variant="ghost">取消</BaseButton><BaseButton loading>結帳</BaseButton></>)
    const hint = 'variant、loading 是元件自己的 props：要從 props 解構出來，不能留在 rest 裡一起展開到 <button>'
    expect(screen.getByRole('button', { name: '取消' }).hasAttribute('variant'), hint).toBe(false)
    expect(screen.getByRole('button', { name: '結帳' }).hasAttribute('loading'), hint).toBe(false)
    expect(error.mock.calls.map(args => args.join(' ')), `React 印出了警告。${hint}`).toEqual([])
  })

  test('loading 時 disabled、aria-busy="true"，按了不會呼叫 onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<BaseButton loading onClick={onClick}>結帳</BaseButton>)
    const button = screen.getByRole('button', { name: '結帳' })
    expect(button, 'loading 時 <button> 要 disabled').toBeDisabled()
    expect(button, 'loading 時加上 aria-busy="true"').toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  test('loading 時，使用的人傳的 disabled={false} 蓋不掉', () => {
    render(<BaseButton loading disabled={false}>結帳</BaseButton>)
    expect(screen.getByRole('button', { name: '結帳' }), '元件自己要保證的屬性寫在 {...rest} 後面，或把 disabled 解構出來合併：disabled || loading').toBeDisabled()
  })

  test('沒有 loading 時：disabled 照使用的人傳的，沒有 aria-busy', () => {
    render(<><BaseButton>結帳</BaseButton><BaseButton disabled>售完</BaseButton><BaseButton loading={false}>重試</BaseButton></>)
    expect(screen.getByRole('button', { name: '結帳' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '結帳' }).hasAttribute('aria-busy'), '不是 loading 時不要有 aria-busy 屬性').toBe(false)
    expect(screen.getByRole('button', { name: '重試' }).hasAttribute('aria-busy'), 'loading={false} 時也不要有 aria-busy 屬性').toBe(false)
    expect(screen.getByRole('button', { name: '售完' }), '使用的人傳的 disabled 要有效').toBeDisabled()
  })
})
