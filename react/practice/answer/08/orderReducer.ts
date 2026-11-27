// 練習 2：訂單狀態機（不合法的轉換要擋下來）
// 訂單的流程：pending（等待付款）→ paid（已付款）→ preparing（製作中）→ ready（可以取餐）→ completed（已取餐）
//             pending、paid 可以取消，變成 cancelled；開始製作之後就不能取消
// 問題：下面的 orderReducer 不看現在的狀態，收到什麼 action 就變成什麼：還沒付款的訂單收到 started 會直接開始製作，
//       已取餐的訂單可以被取消；付款時間用 new Date()，同樣的輸入每次結果不同（不純）。
// 要求：
//   1. 只有下面這些轉換合法，其他一律回傳原本的 state（同一個參考），不要丟錯：
//        paid：pending → paid，paidAt 用 action.at　　started：paid → preparing
//        finished：preparing → ready　　picked_up：ready → completed
//        cancelled：pending、paid → cancelled，reason 用 action.reason
//   2. paid 之後的每個狀態都要保留 paidAt；cancelled 只有 status 與 reason，不能留著 paidAt
//   3. canCancel(state)：現在能不能取消（只有 pending、paid 是 true）。cancelled 的規則只寫一份，reducer 也用它
//   4. reducer 要純：不讀時鐘、不產生亂數、不改傳進來的 state 與 action（測試會凍結它們）
//   5. switch 的 default 用 never 做窮舉檢查
// 不能做的事：改 OrderState、OrderAction 的定義；用 any 或型別斷言繞過
export type OrderState =
  | { status: 'pending' }
  | { status: 'paid'; paidAt: string }
  | { status: 'preparing'; paidAt: string }
  | { status: 'ready'; paidAt: string }
  | { status: 'completed'; paidAt: string }
  | { status: 'cancelled'; reason: string }

export type OrderAction =
  | { type: 'paid'; at: string }       // at：付款時間（ISO 字串），由發出 action 的人決定
  | { type: 'started' }
  | { type: 'finished' }
  | { type: 'picked_up' }
  | { type: 'cancelled'; reason: string }

export function canCancel(state: OrderState): boolean {
  return state.status === 'pending' || state.status === 'paid'
}

export function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case 'paid':
      return state.status === 'pending' ? { status: 'paid', paidAt: action.at } : state
    case 'started':
      return state.status === 'paid' ? { ...state, status: 'preparing' } : state
    case 'finished':
      return state.status === 'preparing' ? { ...state, status: 'ready' } : state
    case 'picked_up':
      return state.status === 'ready' ? { ...state, status: 'completed' } : state
    case 'cancelled':
      // 不用 { ...state }：paid 的 paidAt 不能帶到 cancelled
      return canCancel(state) ? { status: 'cancelled', reason: action.reason } : state
    default: {
      const _exhaustive: never = action
      return state
    }
  }
}
