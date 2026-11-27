import { useState } from 'react'

// 錯在：toggle 每次 render 都是新的函式
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial)
  const toggle = () => setOn(v => !v)
  return [on, toggle, setOn] as const
}
