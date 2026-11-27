/*
練習 4（下）：店員看板的「可以取餐」（第 16 課的 useMutation 與失效、第 24 課的按鈕名稱與狀態訊息）
StaffBoard 的查詢已經寫好。驗收條件：
  1. 每筆還沒好的訂單有一顆按鈕，畫面上的字是「可以取餐」；好幾顆按鈕字一樣，讀螢幕軟體分不出來，
     所以名稱要是「{顧客}的訂單可以取餐」，例如「王小明的訂單可以取餐」
  2. 按下去用 useMutation 呼叫 api.markReady(訂單編號)；等待時只有那一顆按鈕 disabled
  3. 成功：讓 ['staff-orders', storeId] 失效重抓，mutation 要等重抓完才算結束；
     <p role="status"> 從一開始就在畫面上（內容是空的），成功後變成「已通知{顧客}取餐」
  4. 失敗：顯示 <p role="alert">標記失敗，請再試一次</p>；下一次按的時候要先消失
  5. 不要樂觀更新：伺服器確認了才算數（客人會收到取餐通知）
*/
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShopApi } from '../../shared/api.ts'

const STATUS = { received: '已收單', brewing: '製作中', ready: '可以取餐' } as const

export function StaffBoard({ api }: { api: Pick<ShopApi, 'getStoreOrders' | 'markReady'> }) {
  const storeId = Number(useParams().storeId)
  const queryClient = useQueryClient()
  const { data: orders } = useQuery({
    queryKey: ['staff-orders', storeId],
    queryFn: ({ signal }) => api.getStoreOrders(storeId, { signal }),
  })
  const mutation = useMutation({
    mutationFn: (orderId: number) => api.markReady(orderId),
    // 回傳 Promise：重抓完成之前 mutation 都還是 pending
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-orders', storeId] }),
  })

  return (
    <section>
      <h1>店員看板</h1>
      {orders ? (
        <ul>
          {orders.map(o => (
            <li key={o.id}>
              #{o.id} {o.customer}：{STATUS[o.status]}
              {o.status !== 'ready' && (
                <button
                  type="button"
                  aria-label={`${o.customer}的訂單可以取餐`}
                  disabled={mutation.isPending && mutation.variables === o.id}
                  onClick={() => mutation.mutate(o.id)}
                >
                  可以取餐
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <p>載入中…</p>}
      <p role="status">{mutation.isSuccess ? `已通知${mutation.data.customer}取餐` : ''}</p>
      {mutation.isError && <p role="alert">標記失敗，請再試一次</p>}
    </section>
  )
}
