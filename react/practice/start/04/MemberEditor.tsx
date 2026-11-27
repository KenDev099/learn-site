// 練習 3：會員資料編輯 MemberEditor（非受控 + FormData）
// 情境：後台的會員編輯表單只在按「儲存」時才需要欄位的值，打字的過程不需要即時反應，適合用非受控。
// 問題：欄位寫了 value 卻沒有 onChange，變成唯讀，打不進字；按「儲存」送出的是原本的 member。
// 要求：
//   1. 三個欄位都是非受控：用 defaultValue／defaultChecked 帶入 member，不用 useState 存欄位的值
//      （測試會數這個元件 commit 的次數：使用者打字、勾選時，元件不能重新 render）
//   2. 按「儲存」：preventDefault，用 new FormData(e.currentTarget) 讀出欄位，呼叫
//        onSave({ id: member.id, name: 去掉頭尾空白的姓名, points: 數字, newsletter: 布林 })
//      FormData 讀到的都是字串；沒勾選的 checkbox 在 FormData 裡沒有這個 key
//   3. props 的 member 換成另一位會員（id 不同）時，欄位要顯示新會員的資料，之前打到一半的內容要丟掉；
//      同一位會員重新 render 時，使用者打到一半的內容不能被清掉
//   4. 按「還原」：欄位回到 member 的資料（用瀏覽器原生的 <button type="reset">，不用寫事件處理函式）
// 不能做的事：不能修改 member（測試傳入的是凍結的物件）
export type Member = { id: number; name: string; points: number; newsletter: boolean }

export function MemberEditor({ member, onSave }: { member: Member; onSave: (member: Member) => void }) {
  return (
    <form>
      <label>
        姓名
        <input name="name" value={member.name} />
      </label>
      <label>
        點數
        <input type="number" name="points" min={0} value={member.points} />
      </label>
      <label>
        <input type="checkbox" name="newsletter" checked={member.newsletter} />
        訂閱電子報
      </label>
      <button type="submit" onClick={() => onSave(member)}>儲存</button>
      <button type="button">還原</button>
    </form>
  )
}
