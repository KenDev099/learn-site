import { StrictMode, useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuantityStepper } from './QuantityStepper.tsx'
import { renderCounter } from '../../helpers/render-count.tsx'

const shown = () => within(screen.getByRole('group', { name: '數量' })).getByRole('status').textContent
const inc = () => screen.getByRole('button', { name: '增加' })
const dec = () => screen.getByRole('button', { name: '減少' })

function setup(defaultValue?: number) {
  const onChange = vi.fn<(quantity: number) => void>()
  const user = userEvent.setup()
  render(<QuantityStepper defaultValue={defaultValue} onChange={onChange} />)
  return { onChange, user }
}

describe('練習 3：QuantityStepper 在事件處理函式裡通知父元件', () => {
  test('掛載時不呼叫 onChange', () => {
    const { onChange } = setup()
    expect(shown()).toBe('1')
    expect(onChange, '客人還沒按任何按鈕，不能呼叫 onChange：不要用 effect「qty 變了就通知」，effect 在掛載時也會執行').not.toHaveBeenCalled()
  })

  test('按「增加」「減少」：更新畫面，並用新的數量呼叫 onChange 一次', async () => {
    const { onChange, user } = setup(3)
    await user.click(inc())
    expect(shown()).toBe('4')
    expect(onChange.mock.calls, '數量 3 按「增加」要呼叫 onChange(4)：傳的是新的數量，不是這次 render 的舊 qty').toEqual([[4]])
    await user.click(dec())
    await user.click(dec())
    expect(shown()).toBe('2')
    expect(onChange.mock.calls, '每按一次恰好呼叫一次 onChange，帶著那次的新數量').toEqual([[4], [3], [2]])
  })

  test('數量範圍 1～20：到了邊界再按，數量不變，也不呼叫 onChange', async () => {
    const top = setup(19)
    await top.user.click(inc())
    await top.user.click(inc())
    await top.user.click(inc())
    expect(shown(), '數量上限是 20').toBe('20')
    expect(top.onChange.mock.calls, '從 19 連按三次「增加」只應該通知一次 onChange(20)：數量沒變就不要通知').toEqual([[20]])
    cleanup()

    const bottom = setup(2)
    await bottom.user.click(dec())
    await bottom.user.click(dec())
    expect(shown(), '數量下限是 1').toBe('1')
    expect(bottom.onChange.mock.calls, '從 2 連按兩次「減少」只應該通知一次 onChange(1)').toEqual([[1]])
  })

  test('父元件在 onChange 裡 setState：按一次只 render 一輪', async () => {
    const counter = renderCounter()
    const user = userEvent.setup()
    function CartRow() {
      const [qty, setQty] = useState(1)
      return (
        <>
          <QuantityStepper onChange={setQty} />
          <p>小計 ${qty * 110}</p>
        </>
      )
    }
    render(<counter.Profile id="row"><CartRow /></counter.Profile>)
    expect(counter.commits('row'), '掛載之後不應該再 render：掛載時不要通知父元件').toBe(0)
    await user.click(inc())
    expect(screen.getByText('小計 $220'), '父元件收到 onChange(2) 後小計要變成 $220').toBeInTheDocument()
    expect(counter.commits('row'), '按一次「增加」render 了不只一輪：在事件處理函式裡同時 setQty 與呼叫 onChange，React 會把兩個元件的更新批次成一次；用 effect 通知會變成兩輪').toBe(1)
  })

  test('父元件每次 render 都傳新的 onChange 函式，也只通知一次', async () => {
    const received: number[] = []
    const user = userEvent.setup()
    function CartRow() {
      const [qty, setQty] = useState(1)
      return (
        <>
          <QuantityStepper onChange={q => { received.push(q); setQty(q) }} />
          <p>小計 ${qty * 110}</p>
        </>
      )
    }
    render(<CartRow />)
    await user.click(inc())
    await user.click(inc())
    expect(received, 'onChange 是 inline 函式（每次 render 都是新的）時，按兩次只能收到 2、3：不要讓「onChange 換了」變成重新通知的原因').toEqual([2, 3])
  })

  test('StrictMode 下按一次也只通知一次', async () => {
    const onChange = vi.fn<(quantity: number) => void>()
    const user = userEvent.setup()
    render(<StrictMode><QuantityStepper onChange={onChange} /></StrictMode>)
    expect(onChange, 'StrictMode 掛載時也不能呼叫 onChange').not.toHaveBeenCalled()
    await user.click(inc())
    expect(onChange.mock.calls, 'StrictMode 開發時會把 setQty 的 updater 函式呼叫兩次來檢查它純不純：onChange 不能寫在 updater 裡，要直接寫在事件處理函式裡').toEqual([[2]])
    expect(shown()).toBe('2')
  })
})
