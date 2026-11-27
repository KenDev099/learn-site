import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QuantityStepper } from './QuantityStepper.tsx'

const shown = () => screen.getByRole('status').textContent   // <output> 的 role 是 status
const inc = () => screen.getByRole('button', { name: '增加' })
const dec = () => screen.getByRole('button', { name: '減少' })

describe('練習 4：QuantityStepper 同時支援受控與非受控', () => {
  test('非受控：沒傳 value 時自己記數量，從 defaultValue 開始', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityStepper defaultValue={3} onChange={onChange} />)
    expect(shown(), '沒傳 value 時，初始數量是 defaultValue').toBe('3')
    expect(onChange, '掛載時不能呼叫 onChange：只有使用者按按鈕才通知（不要在 effect 裡呼叫）').not.toHaveBeenCalled()
    await user.click(inc())
    await user.click(inc())
    await user.click(dec())
    expect(shown(), '沒傳 value 時元件要自己用 useState 記數量：按了畫面要變').toBe('4')
    expect(onChange.mock.calls, '非受控時每次改變也要呼叫 onChange(新數量)，每按一次剛好一次').toEqual([[4], [5], [4]])
  })

  test('非受控：什麼都不傳也能用，預設從 1 開始', async () => {
    const user = userEvent.setup()
    // 事件處理函式裡丟出的錯誤，React 會轉成 window 的 error 事件，不會讓測試直接失敗：這裡把它收起來檢查
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault() }
    window.addEventListener('error', onError)
    try {
      render(<QuantityStepper />)
      expect(shown(), 'defaultValue 的預設值是 1').toBe('1')
      await user.click(inc())
      expect(shown()).toBe('2')
    } finally {
      window.removeEventListener('error', onError)
    }
    expect(errors.map(String), 'onChange 沒傳時按按鈕丟出了錯誤：onChange 是選填的，呼叫時寫 onChange?.(next)，不要寫 onChange!(next) 或 onChange(next)').toEqual([])
  })

  test('非受控：defaultValue 之後改了，不影響目前的數量', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<QuantityStepper defaultValue={2} />)
    await user.click(inc())
    rerender(<QuantityStepper defaultValue={9} />)
    expect(shown(), 'defaultValue 只是初始值，只在掛載時讀一次：不要用 effect 跟著它更新 state').toBe('3')
  })

  test('受控：父元件沒有更新 value，畫面就不變', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityStepper value={3} onChange={onChange} />)
    await user.click(inc())
    await user.click(inc())
    expect(onChange.mock.calls, '受控時按 + 只呼叫 onChange(value + 1)：父元件沒更新，第二次還是從 3 算').toEqual([[4], [4]])
    expect(shown(), '有傳 value 時畫面永遠顯示 value：不能自己改（父元件可能拒絕這次修改，例如庫存不夠）').toBe('3')
  })

  test('受控：父元件用 state 接起來就能加減，也能從外面改', async () => {
    const user = userEvent.setup()
    function Parent() {
      const [qty, setQty] = useState(5)
      return <><QuantityStepper value={qty} onChange={setQty} /><button onClick={() => setQty(12)}>設成 12</button></>
    }
    render(<Parent />)
    await user.click(dec())
    expect(shown()).toBe('4')
    await user.click(screen.getByRole('button', { name: '設成 12' }))
    expect(shown(), '父元件改了 value，畫面要跟著變').toBe('12')
    await user.click(inc())
    expect(shown(), '下一次加減要從新的 value 算').toBe('13')
  })

  test('受控：value 是 0 也算有傳', () => {
    render(<QuantityStepper value={0} defaultValue={5} min={0} />)
    expect(shown(), '用 value !== undefined 判斷是不是受控：value || … 會把 0 當成沒傳').toBe('0')
  })

  test('到上限、下限時按鈕 disabled，而且不呼叫 onChange', () => {
    const onChange = vi.fn()
    const { unmount } = render(<QuantityStepper value={20} onChange={onChange} />)
    expect(inc(), '數量已經是 max（預設 20）時，「增加」要 disabled').toBeDisabled()
    expect(dec()).toBeEnabled()
    fireEvent.click(inc())
    expect(onChange, '數量不能超過 max').not.toHaveBeenCalled()
    unmount()

    render(<QuantityStepper value={1} onChange={onChange} />)
    expect(dec(), '數量已經是 min（預設 1）時，「減少」要 disabled').toBeDisabled()
    expect(inc()).toBeEnabled()
    fireEvent.click(dec())
    expect(onChange, '數量不能小於 min').not.toHaveBeenCalled()
  })

  test('min、max 可以自訂；非受控時連按也停在上限', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityStepper defaultValue={4} min={2} max={5} onChange={onChange} />)
    await user.click(inc())
    expect(inc(), '到了自訂的 max 也要 disabled').toBeDisabled()
    await user.click(dec())
    await user.click(dec())
    await user.click(dec())
    expect(shown()).toBe('2')
    expect(dec()).toBeDisabled()
    expect(onChange.mock.calls).toEqual([[5], [4], [3], [2]])
  })
})
