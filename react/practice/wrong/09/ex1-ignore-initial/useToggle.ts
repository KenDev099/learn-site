import { useCallback, useState } from 'react'

// 錯在：沒用 initial，初始值寫死 false
export function useToggle(initial = false) {
  const [on, setOn] = useState(false)
  const toggle = useCallback(() => setOn(v => !v), [])
  void initial
  return [on, toggle, setOn] as const
}
