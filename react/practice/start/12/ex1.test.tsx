import { createRef } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { typecheck } from '../../helpers/typecheck.ts'
import { Button } from './Button.tsx'

describe('練習 1：Button 的 props 型別＝原生 button 屬性＋variant、icon', () => {
  test('型別：正確用法通過，錯誤用法都要報錯', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.tsx': [
        "import { useRef } from 'react'",
        "import { Button } from './Button.tsx'",
        '',
        'export function Ok() {',
        '  const buttonRef = useRef<HTMLButtonElement>(null)',
        '  return (',
        '    <form>',
        '      <Button>加入</Button>',
        '      <Button variant="primary" icon="★" className="wide" data-track="add"><strong>加入</strong> 購物車</Button>',
        '      <Button variant="ghost" icon={<span>★</span>} disabled aria-label="加入拿鐵" ref={buttonRef} type="submit"',
        '        onClick={e => { const el: HTMLButtonElement = e.currentTarget; console.log(el.form, e.clientX) }}>加入</Button>',
        '      {/* 原生 <button> 的其他屬性也都要能傳：不能只列出自己想到的幾個 */}',
        '      <Button form="checkout" name="intent" value="add" title="加入購物車" tabIndex={0} autoFocus style={{ minWidth: 80 }}',
        '        onKeyDown={e => console.log(e.key)} onPointerEnter={e => console.log(e.pointerType)}>加入</Button>',
        '    </form>',
        '  )',
        '}',
        '',
        'export function Bad() {',
        '  const inputRef = useRef<HTMLInputElement>(null)',
        '  return [',
        "    // @ts-expect-error variant 只能是 'primary' 或 'ghost'",
        '    <Button variant="big">加入</Button>,',
        '    // @ts-expect-error 打錯字的 prop 要報錯',
        '    <Button varient="ghost">加入</Button>,',
        '    // @ts-expect-error <button> 沒有 href',
        '    <Button href="/menu">看菜單</Button>,',
        '    // @ts-expect-error disabled 是 boolean',
        '    <Button disabled="yes">加入</Button>,',
        '    // @ts-expect-error onClick 要是函式，不是字串',
        '    <Button onClick="add()">加入</Button>,',
        '    // @ts-expect-error 一般物件不是 ReactNode',
        "    <Button icon={{ name: 'star' }}>加入</Button>,",
        '    // @ts-expect-error ref 要指向 HTMLButtonElement',
        '    <Button ref={inputRef}>加入</Button>,',
        '  ]',
        '}',
        '',
      ].join('\n'),
    })
    expect(errors,
      '型別檢查沒過。TS2578（Unused \'@ts-expect-error\' directive）代表那一行的錯誤用法沒被擋下：props 的型別太寬（any、unknown、string、索引簽章）。' +
      '其他錯誤代表正確用法被擋下：props 要是 ComponentProps<\'button\'> & { variant?: \'primary\' | \'ghost\'; icon?: ReactNode }，' +
      '原生屬性不要自己列、也不要用缺少 disabled／type 的 HTMLAttributes：\n' + errors).toBe('')
  }, 30_000)

  test('className 是 btn btn-<variant>，預設 primary；傳進來的 className 接在後面', () => {
    const { rerender } = render(<Button>加入</Button>)
    const button = screen.getByRole('button', { name: '加入' })
    expect(button, '沒傳 variant 時是 primary：解構時給預設值 variant = \'primary\'').toHaveClass('btn', 'btn-primary', { exact: true })
    rerender(<Button variant="ghost" className="wide">加入</Button>)
    expect(button, 'variant="ghost" className="wide" → class 要是 "btn btn-ghost wide"：把 className 解構出來自己合併，不要讓 {...rest} 蓋掉').toHaveClass('btn', 'btn-ghost', 'wide', { exact: true })
  })

  test('icon 是 ReactNode：JSX 與字串都能放，出現在文字前面', () => {
    const { rerender } = render(<Button icon={<svg data-testid="icon" />}>加入</Button>)
    const button = screen.getByRole('button', { name: '加入' })
    expect(screen.queryByTestId('icon'), 'icon 傳 JSX 時要 render 出來：在 <button> 裡直接寫 {icon}').not.toBeNull()
    expect(button.firstElementChild, 'icon 要在 <button> 裡、文字前面').toBe(screen.getByTestId('icon'))
    rerender(<Button icon="★">加入</Button>)
    expect(button, 'icon 傳字串時也要顯示，而且在文字前面').toHaveTextContent(/^★\s*加入$/)
    rerender(<Button>加入</Button>)
    expect(button, '沒傳 icon 時只有文字').toHaveTextContent(/^加入$/)
  })

  test('type 預設是 button，有傳就用傳進來的', () => {
    const { rerender } = render(<Button>加入</Button>)
    const button = screen.getByRole('button', { name: '加入' })
    expect(button, '沒傳 type 時要是 type="button"：原生預設是 submit，放在 <form> 裡按了會送出表單').toHaveAttribute('type', 'button')
    rerender(<Button type="submit">加入</Button>)
    expect(button, '傳了 type="submit" 就要是 submit：預設值寫在解構（type = \'button\'），不要寫死').toHaveAttribute('type', 'submit')
  })

  test('其餘的原生屬性都展開到 <button>：disabled、aria-label、data-*、onClick、ref', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    const { rerender } = render(<Button ref={ref} aria-label="加入拿鐵" data-track="add" onClick={onClick}>加入</Button>)
    const button = screen.getByRole('button')
    expect(button, 'aria-label 要落在 <button> 上：沒有被解構出來的 props 用 {...rest} 展開到 <button>').toHaveAccessibleName('加入拿鐵')
    expect(button, 'data-track 要落在 <button> 上：用 {...rest} 展開，不要一個一個挑').toHaveAttribute('data-track', 'add')
    expect(ref.current, 'ref 要指到 <button>：React 19 的 ref 是一般 prop，包含在 ComponentProps<\'button\'> 裡，跟著 {...rest} 展開就好').toBe(button)
    await user.click(button)
    expect(onClick, '按一下，傳進來的 onClick 要被呼叫一次').toHaveBeenCalledTimes(1)
    rerender(<Button ref={ref} aria-label="加入拿鐵" disabled onClick={onClick}>加入</Button>)
    expect(button, '傳了 disabled 按鈕就要停用').toBeDisabled()
  })
})
