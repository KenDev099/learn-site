/*
練習 2：伺服器和瀏覽器產生一樣的 id（PhoneField）
問題：
  結帳頁改成伺服器渲染之後，電話欄位的 label 點了不會聚焦，console 有 hydration 的錯誤。
  原因是 id 用 Math.random() 產生：伺服器算一次、瀏覽器又算一次，兩個不一樣。
要求：
  1. <label> 用 htmlFor 連到 <input type="tel">，input 用 aria-describedby 連到說明文字 <p>（「格式：0912-345-678」）
  2. 伺服器的 HTML 和 hydration 後的 id 一樣，hydration 沒有錯誤
  3. 同一頁放好幾個 PhoneField（就算 label 一樣）id 也不能重複
  4. 伺服器先渲染過別的頁面，再渲染這一頁，也要一致
不能做的事：
  - 不要改 ssr-utils.tsx；不要讓呼叫端傳 id 進來（props 維持只有 label）
*/
export function PhoneField({ label }: { label: string }) {
  const id = `phone-${Math.random().toString(36).slice(2)}`

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="tel" name="phone" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`}>格式：0912-345-678</p>
    </div>
  )
}
