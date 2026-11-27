// 練習 4：Select（泛型元件）
// 問題：菜單頁選商品、結帳頁選顧客、點餐頁選尺寸都用這個下拉選單。現在選項的型別是 any[]：
//       getLabel={p => p.title}（Product 沒有 title）不會報錯，onChange 收到的也不是選項本身，而是 <select> 的字串。
// 要求：把 Select 改成泛型元件，型別參數 T 是「一個選項」的型別，由傳進來的 options 推論。
//   - options: 選項陣列。要收得下唯讀陣列（PRODUCTS 是 readonly Product[]、['S', 'M', 'L'] as const 是唯讀 tuple）
//   - value: 目前選中的選項；null 代表還沒選，這時顯示停用的「請選擇」
//   - onChange: 使用者選了之後呼叫，參數是 options 裡的那個選項（T），不是字串
//   - getKey: 從選項取出唯一的 key（string 或 number），當 <option> 的 key 與 value
//   - getLabel: 從選項取出要顯示的文字
//   - label: 欄位名稱（已經寫好）
//   判斷「哪個選項被選中」一律比 getKey 的結果：value 可能是另一次抓回來的資料（內容一樣、參考不同），
//   兩個選項的顯示文字也可能相同。
// 不能做的事：用 any、unknown；用 as 斷言把字串當成 T；限制 T 一定要有 id 或 name（尺寸是字串）
import type { ChangeEvent } from 'react'

type SelectProps = {
  label: string
  options: any[]            // readonly T[] 收得下 T[] 也收得下唯讀陣列；反過來不行
  value: any
  onChange: (value: any) => void
  getKey: (option: any) => string | number
  getLabel: (option: any) => string
}

// T 沒有限制（不寫 extends）：元件只透過 getKey、getLabel 讀選項，所以字串、物件都能當選項
export function Select({ label, options, value, onChange, getKey, getLabel }: SelectProps) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    // <select> 的值永遠是字串：用它找回 options 裡的那個選項，再交給 onChange
    const picked = options.find(option => String(getKey(option)) === e.target.value)
    if (picked !== undefined) onChange(picked)
  }

  return (
    <label>
      {label}
      <select value={value === null ? '' : String(getKey(value))} onChange={handleChange}>
        <option value="" disabled>請選擇</option>
        {options.map(option => (
          <option key={getKey(option)} value={getKey(option)}>{getLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}
