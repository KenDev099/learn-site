// 練習 2：等候清單 WaitingList（render 裡不讀時鐘）
// 問題：吧台螢幕顯示每位客人已經等了幾分鐘。Date.now() 寫在 render 裡：
//       同樣的 props 每次 render 結果都不一樣（不純），而且沒有人重新 render 時，分鐘數就停住不動。
//       畫面一旦被記憶化就更糟（例如包進 memo 或 useMemo）：orders 沒變，整段畫面會被沿用，Date.now() 根本不會再被呼叫。
// 要求：
//   1. 每位客人顯示「名字：已等 N 分鐘」，N = 現在時間減 placedAt，以分鐘為單位無條件捨去
//   2. 「現在時間」放進 state：掛上時讀一次，之後每 60 秒更新一次（整張清單共用一個計時器）
//   3. 時間一分鐘只造成一次重新 render，不能每秒都 render
//   4. 卸載時清掉計時器
// 不能做的事：在 render 過程中呼叫 Date.now()、new Date()（初始值函式 useState(() => …) 和計時器的 callback 可以）；用註解關掉 lint 規則
export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const now = Date.now()   // ✗ render 裡讀時鐘

  return (
    <ul aria-label="等候中">
      {orders.map(o => (
        <li key={o.id}>{o.customer}：已等 {Math.floor((now - o.placedAt) / 60000)} 分鐘</li>
      ))}
    </ul>
  )
}
