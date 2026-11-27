// 錯誤寫法：用函式元件加 try/catch 當錯誤邊界。
// children 是在這個函式 return 之後才由 React render 的，子元件丟出的錯誤不會經過這裡的 try
import type { ReactNode } from 'react'

export type FallbackProps = { error: Error; reset: () => void }

type Props = {
  children: ReactNode
  fallback: (props: FallbackProps) => ReactNode
  onError?: (error: unknown, componentStack: string) => void
}

export function ErrorBoundary({ children, fallback, onError }: Props) {
  try {
    return <>{children}</>
  } catch (error) {
    onError?.(error, '')
    return fallback({ error: error instanceof Error ? error : new Error(String(error)), reset: () => {} })
  }
}
