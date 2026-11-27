import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { ApiError, type CheckoutApi } from './api.ts'
import { CheckoutButton } from './CheckoutButton.tsx'
import type { ErrorContext, Reporter } from './reporter.ts'

function setup() {
  const pending: Deferred<{ orderId: number }>[] = []
  const api: CheckoutApi = {
    checkout() {
      const d = deferred<{ orderId: number }>()
      pending.push(d)
      return d.promise
    },
  }
  const calls: [unknown, ErrorContext][] = []
  const reporter: Reporter = { capture: (error, context) => { calls.push([error, context]) } }
  const rejections: unknown[] = []
  const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason)
  render(<CheckoutButton api={api} reporter={reporter} />)
  return { user: userEvent.setup(), pending, calls, rejections, onRejection }
}

const button = () => screen.getByRole('button')

describe('練習 1：結帳按鈕的錯誤處理', () => {
  test('等待中按鈕 disabled、顯示「結帳中…」，連按只送出一次；成功顯示訂單編號', async () => {
    const { user, pending } = setup()
    await user.click(button())
    expect(button(), '等待結果時按鈕要 disabled').toBeDisabled()
    expect(button()).toHaveTextContent('結帳中…')
    await user.click(button())
    expect(pending.length, '等待中再按不能再呼叫 api.checkout').toBe(1)
    pending[0].resolve({ orderId: 42 })
    expect(await screen.findByRole('status')).toHaveTextContent('訂單 #42 已成立')
    expect(button()).toBeEnabled()
    expect(button()).toHaveTextContent('結帳')
  })

  test('4xx 的 ApiError 是預期中的錯誤：顯示伺服器的訊息，不回報', async () => {
    const { user, pending, calls } = setup()
    await user.click(button())
    pending[0].reject(new ApiError(409, '拿鐵庫存不足'))
    expect(await screen.findByRole('alert'), '預期中的錯誤顯示伺服器給的 message').toHaveTextContent('拿鐵庫存不足')
    expect(calls, '庫存不足是預期中的錯誤，不要送到監控：全送上去會淹沒真正的問題').toEqual([])
    expect(button(), '失敗之後按鈕要恢復，客人才能再試').toBeEnabled()
    expect(button()).toHaveTextContent('結帳')
  })

  test('預期外的錯誤：顯示通用訊息，回報原本的錯誤一次', async () => {
    const { user, pending, calls } = setup()
    await user.click(button())
    const error = new TypeError("Cannot read properties of undefined (reading 'id')")
    pending[0].reject(error)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('結帳失敗，請稍後再試')
    expect(alert.textContent, '不要把原始的錯誤訊息給客人看').not.toContain('Cannot read')
    expect(calls, '預期外的錯誤要 reporter.capture(原本的錯誤, { source: \'handler\' }) 剛好一次').toEqual([[error, { source: 'handler' }]])
    expect(button()).toBeEnabled()
  })

  test('5xx 的 ApiError 也是預期外的錯誤', async () => {
    const { user, pending, calls } = setup()
    await user.click(button())
    const error = new ApiError(503, 'upstream connect error')
    pending[0].reject(error)
    expect(await screen.findByRole('alert'), '5xx 是伺服器壞了，訊息不是寫給客人看的').toHaveTextContent('結帳失敗，請稍後再試')
    expect(calls, '只有 4xx 算預期中的錯誤；5xx 要回報').toEqual([[error, { source: 'handler' }]])
  })

  test('錯誤不往外丟，再按一次成功後錯誤訊息消失', async () => {
    const { user, pending, rejections, onRejection } = setup()
    window.addEventListener('unhandledrejection', onRejection)
    try {
      await user.click(button())
      pending[0].reject(new TypeError('Failed to fetch'))
      await screen.findByRole('alert')
      await new Promise(r => setTimeout(r, 0))
      expect(rejections, '錯誤 catch 之後不要再丟出去').toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', onRejection)
    }
    await user.click(button())
    expect(screen.queryByRole('alert'), '再按一次時清掉上一次的錯誤').toBeNull()
    pending[1].resolve({ orderId: 43 })
    expect(await screen.findByRole('status')).toHaveTextContent('訂單 #43 已成立')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
