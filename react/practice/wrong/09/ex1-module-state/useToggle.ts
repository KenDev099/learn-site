import { useCallback, useState } from 'react'

// 錯在：state 放在模組層級（Vue 的「共用 composable」寫法）：所有呼叫共用同一個值
let shared = false

export function useToggle(initial = false) {
  const [, rerender] = useState(0)
  const toggle = useCallback(() => { shared = !shared; rerender(n => n + 1) }, [])
  const setOn = useCallback((value: boolean) => { shared = value; rerender(n => n + 1) }, [])
  void initial
  return [shared, toggle, setOn] as const
}
