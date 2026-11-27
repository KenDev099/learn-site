/*
練習 1：事件處理函式裡的錯誤：分成預期中與預期外，各自顯示與回報
問題：
  結帳按鈕只寫了成功的情況。庫存不足時畫面沒有任何反應，客人一直按；
  網路斷線時也一樣，而且 Error Boundary 攔不到事件處理函式的錯誤，監控也沒收到。
要求：
  1. 按下「結帳」呼叫 api.checkout() 一次；等待時按鈕 disabled、文字是「結帳中…」，結束後（成功或失敗）恢復成「結帳」
  2. 成功：顯示 <p role="status">訂單 #編號 已成立</p>
  3. 預期中的錯誤：ApiError 而且 status 是 4xx（例如 409 庫存不足）。顯示 <p role="alert">伺服器給的 message</p>，不回報
  4. 其他都是預期外的錯誤（5xx 的 ApiError、斷線的 TypeError、程式錯誤）：
     顯示 <p role="alert">結帳失敗，請稍後再試</p>，不要把原始的錯誤訊息給客人看；
     呼叫 reporter.capture(原本的錯誤, { source: 'handler' }) 剛好一次
  5. 錯誤不能再往外丟（不能變成沒有人接的 Promise 失敗）
  6. 再按一次時清掉上一次的訊息；成功之後不能還顯示錯誤
*/
import { useState } from 'react'
import { ApiError, type CheckoutApi } from './api.ts'
import type { Reporter } from './reporter.ts'

export function CheckoutButton({ api, reporter }: { api: CheckoutApi; reporter: Reporter }) {
  const [pending, setPending] = useState(false)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function checkout() {
    setPending(true)
    setOrderId(null)
    setError(null)
    try {
      const result = await api.checkout()
      setOrderId(result.orderId)
      setPending(false)
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setError(e.message)                                   // 預期中：給客人看伺服器的說明
      } else {
        reporter.capture(e, { source: 'handler' })            // 預期外：回報原本的錯誤
        setError('結帳失敗，請稍後再試')
      }
    }
  }

  return (
    <div>
      <button type="button" onClick={checkout} disabled={pending}>{pending ? '結帳中…' : '結帳'}</button>
      {orderId !== null && <p role="status">訂單 #{orderId} 已成立</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
