import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { typecheck } from '../../helpers/typecheck.ts'
import { OrderStatus } from './OrderStatus.tsx'

describe('練習 2：OrderStatus 的 props 是辨識聯合', () => {
  test('型別：三種狀態各自的組合通過，缺資料、多資料、不存在的狀態都要報錯', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.tsx': [
        "import type { ComponentProps } from 'react'",
        "import { OrderStatus } from './OrderStatus.tsx'",
        '',
        'export const ok = [',
        '  <OrderStatus status="preparing" minutesLeft={5} />,',
        '  <OrderStatus status="ready" pickupCode="A12" />,',
        '  <OrderStatus status="cancelled" reason="售完" onReorder={() => console.log(\'reorder\')} />,',
        ']',
        '',
        '// 使用的人拿到 props 也能靠 status 收窄',
        "export function describe(props: ComponentProps<typeof OrderStatus>): string {",
        "  if (props.status === 'ready') return props.pickupCode.toUpperCase()",
        "  if (props.status === 'preparing') return props.minutesLeft.toFixed(0)",
        '  return props.reason.trim()',
        '}',
        '',
        'export const bad = [',
        '  // @ts-expect-error ready 一定要有 pickupCode',
        '  <OrderStatus status="ready" />,',
        '  // @ts-expect-error preparing 一定要有 minutesLeft',
        '  <OrderStatus status="preparing" />,',
        '  // @ts-expect-error preparing 不能帶 pickupCode',
        '  <OrderStatus status="preparing" minutesLeft={5} pickupCode="A12" />,',
        '  // @ts-expect-error ready 不能帶 onReorder',
        '  <OrderStatus status="ready" pickupCode="A12" onReorder={() => {}} />,',
        '  // @ts-expect-error cancelled 一定要有 onReorder',
        '  <OrderStatus status="cancelled" reason="售完" />,',
        '  // @ts-expect-error cancelled 一定要有 reason',
        '  <OrderStatus status="cancelled" onReorder={() => {}} />,',
        '  // @ts-expect-error 沒有 shipped 這個狀態',
        '  <OrderStatus status="shipped" />,',
        '  // @ts-expect-error minutesLeft 是 number',
        '  <OrderStatus status="preparing" minutesLeft="5" />,',
        ']',
        '',
      ].join('\n'),
    })
    expect(errors,
      '型別檢查沒過。TS2578（Unused \'@ts-expect-error\' directive）代表那一行不合法的組合沒被擋下：props 要是三個物件型別的聯合，' +
      '每個成員的 status 是不同的字串字面值，自己的資料是必填、別人的資料不出現。' +
      '其他錯誤通常是元件裡還沒收窄就讀了某個狀態才有的屬性：不要在參數解構，先判斷 props.status：\n' + errors).toBe('')
  }, 30_000)

  test('製作中：顯示剩餘分鐘，沒有按鈕', () => {
    const { rerender } = render(<OrderStatus status="preparing" minutesLeft={5} />)
    expect(screen.getByRole('status'), 'preparing 要顯示「製作中，約 5 分鐘」').toHaveTextContent('製作中，約 5 分鐘')
    rerender(<OrderStatus status="preparing" minutesLeft={12} />)
    expect(screen.getByRole('status'), '分鐘數要用 props.minutesLeft，不要寫死').toHaveTextContent('製作中，約 12 分鐘')
    expect(screen.queryByRole('button'), '製作中不該有按鈕').toBeNull()
  })

  test('可以取餐：顯示取餐碼', () => {
    const { rerender } = render(<OrderStatus status="ready" pickupCode="A12" />)
    expect(screen.getByRole('status'), 'ready 要顯示「可以取餐，取餐碼 A12」').toHaveTextContent('可以取餐，取餐碼 A12')
    rerender(<OrderStatus status="ready" pickupCode="B07" />)
    expect(screen.getByRole('status'), '取餐碼要用 props.pickupCode，不要寫死').toHaveTextContent('可以取餐，取餐碼 B07')
    expect(screen.queryByRole('button'), '可以取餐時不該有按鈕').toBeNull()
  })

  test('已取消：顯示原因，按「重新點餐」呼叫 onReorder', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
    render(<OrderStatus status="cancelled" reason="可頌售完" onReorder={onReorder} />)
    expect(screen.getByRole('status'), 'cancelled 要顯示「已取消：」加上 props.reason').toHaveTextContent('已取消：可頌售完')
    await user.click(screen.getByRole('button', { name: '重新點餐' }))
    expect(onReorder, '按「重新點餐」要呼叫 props.onReorder 一次').toHaveBeenCalledTimes(1)
  })
})
