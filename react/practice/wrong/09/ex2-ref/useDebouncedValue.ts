import { useEffect, useRef } from 'react'

// 錯在：結果放在 ref，改 ref 不會重新 render，回傳值永遠不更新（而且在 render 中讀 ref）
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const debounced = useRef(value)
  useEffect(() => {
    const timer = setTimeout(() => { debounced.current = value }, delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced.current
}
