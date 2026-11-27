import { useCallback, useState } from 'react'

// 錯在：沒有 as const，回傳型別是 (boolean | 函式)[]，解構出來不能直接用
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial)
  const toggle = useCallback(() => setOn(v => !v), [])
  return [on, toggle, setOn]
}
