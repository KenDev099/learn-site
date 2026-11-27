// 練習 1：useToggle（第一個自訂 hook）
// 商品卡的「說明」展開／收合、「收藏」開關、對話框的開關，都是同一段邏輯：一個 boolean 加上切換它的函式。
// 把它抽成 useToggle(initial)，回傳 [on, toggle, setOn]：
//   const [open, toggleOpen, setOpen] = useToggle()        // 沒給初始值時是 false
//   const [liked, toggleLiked] = useToggle(true)
// 要求：
//   1. initial 是初始值；每一次呼叫 useToggle 各有自己的 state，互不影響
//   2. toggle() 把值反過來；同一個事件裡連續呼叫兩次要回到原值（第 3 課：state 是快照，用 updater function）
//   3. toggle 的參考要穩定：元件重新 render，拿到的還是同一個函式（useCallback，依賴陣列是空的）
//   4. 回傳值的型別是 tuple：解構出來 on 是 boolean、toggle 可以直接呼叫、setOn 只收 boolean
// 不能做的事：把 state 放在函式外面（模組層級的變數）、用 any 或型別斷言（as const 除外）蓋掉型別。
import { useState } from 'react'

export function useToggle(initial = false) {
  const [on, setOn] = useState(false)

  function toggle() {
    setOn(!on)
  }

  return [on, toggle, setOn]
}
