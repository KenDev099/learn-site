// 錯誤邊界（第 13 課練習 3 的答案，已經寫好，不用改）
import { Component, type ErrorInfo, type ReactNode } from 'react'

export type FallbackProps = { error: Error; reset: () => void }

type Props = {
  children: ReactNode
  fallback: (props: FallbackProps) => ReactNode
  onError?: (error: unknown, componentStack: string) => void
}
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  // render 階段：純函式，只算出「下一次 render 要顯示 fallback」的 state
  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  // commit 之後：每個錯誤呼叫一次，副作用（回報）放這裡；回報原本的值，保留最多資訊
  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info.componentStack ?? '')
  }

  // 箭頭函式屬性：交給 fallback 之後被單獨呼叫，this 仍然是這個元件
  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, reset: this.reset })
    return this.props.children
  }
}
