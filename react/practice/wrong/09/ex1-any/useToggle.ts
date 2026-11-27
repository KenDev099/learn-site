import { useCallback, useState } from 'react'

// 錯在：用 any 蓋掉型別，setOn('yes') 也不會報錯
export function useToggle(initial = false): any[] {
  const [on, setOn] = useState(initial)
  const toggle = useCallback(() => setOn(v => !v), [])
  return [on, toggle, setOn]
}
