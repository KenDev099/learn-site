// 練習 2：取餐資料表單 PickupForm（label、驗證、送出）
// 問題：欄位只有旁邊的文字、沒有 <label>；按「送出」瀏覽器會重新載入整頁，也沒有任何驗證。
// 要求：
//   1. 兩個欄位都要有對應的 <label>（文字是「姓名」「手機」），點文字能聚焦到輸入框；欄位是受控的
//   2. 驗證規則（錯誤訊息由欄位的值在 render 時算出來，不另外存 state）：
//        姓名去掉頭尾空白後不能是空的      → 請輸入姓名
//        手機要是 09 開頭的 10 碼數字      → 手機要是 09 開頭的 10 碼數字
//   3. 一進頁面不顯示錯誤；按過一次「送出」之後才顯示，每個錯誤是一個 <p role="alert">，
//      而且之後每打一個字就跟著更新（改對了立刻消失，不用再按送出）
//   4. 送出時 preventDefault；有錯誤就不呼叫 onSubmit；沒有錯誤就呼叫 onSubmit({ name: 去掉頭尾空白的姓名, phone })
//   5. onSubmit 回傳 Promise。等待期間按鈕要 disabled、文字改成「送出中…」，這段時間再觸發送出也不能再呼叫 onSubmit
//   6. 成功：清空兩個欄位、回到「還沒按過送出」的狀態（不顯示錯誤）
//   7. 失敗（Promise reject）：顯示 <p role="alert">送出失敗，請再試一次</p>、保留使用者輸入的內容、按鈕恢復可以按；
//      下一次送出開始時，這個訊息要消失
export type Pickup = { name: string; phone: string }

export function PickupForm({ onSubmit }: { onSubmit: (data: Pickup) => Promise<void> }) {
  return (
    <form>
      <div>
        <span>姓名</span>
        <input name="name" />
      </div>
      <div>
        <span>手機</span>
        <input name="phone" type="tel" />
      </div>
      <button type="submit" onClick={() => onSubmit({ name: '', phone: '' })}>送出</button>
    </form>
  )
}
