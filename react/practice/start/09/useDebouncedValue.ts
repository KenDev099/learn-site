// 練習 2：useDebouncedValue（有 effect 的 hook）
// 菜單的搜尋框每打一個字就查一次太浪費。useDebouncedValue(value, delayMs) 回傳「慢一步」的值：
// value 停止變化滿 delayMs 毫秒之後，回傳值才跟上；中間每變一次就重新計時。
//   const [keyword, setKeyword] = useState('')
//   const debounced = useDebouncedValue(keyword, 300)   // 用 debounced 去查，不用 keyword
// 要求：
//   1. 第一次 render 直接回傳 value，不用等
//   2. value 改變後，滿 delayMs 才回傳新值；期間 value 又變，舊的計時器要清掉（第 5 課的清理函式）
//   3. 元件卸載時不能留下計時器
//   4. delayMs 由參數決定；跟 value 無關的重新 render 不會讓計時重來
//   5. 泛型：傳 number 回傳 number，傳 string 回傳 string
//   6. react-hooks 的 lint 規則要通過：effect 用到的值都列在依賴陣列，不能用註解停用規則
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    setTimeout(() => setDebounced(value), 300)
  })

  return debounced
}
