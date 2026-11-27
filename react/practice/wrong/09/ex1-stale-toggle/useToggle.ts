import { useCallback, useState } from 'react'

// 錯在：toggle 讀這次 render 的 on（快照）：連續兩次都算出同一個值，而且 on 一變 toggle 就換新的
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial)
  const toggle = useCallback(() => setOn(!on), [on])
  return [on, toggle, setOn] as const
}
