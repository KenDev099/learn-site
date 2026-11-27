import { useCallback, useState } from 'react'

export function useToggle(initial = false) {
  const [on, setOn] = useState(initial)
  // updater function：連續呼叫兩次會回到原值；依賴陣列是空的，toggle 永遠是同一個函式
  const toggle = useCallback(() => setOn(v => !v), [])
  // as const：回傳型別是 tuple，不是 (boolean | 函式)[]
  return [on, toggle, setOn] as const
}
