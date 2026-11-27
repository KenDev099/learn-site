// 練習 3：錯誤邊界 ErrorBoundary（class 元件、回報、重試）
// 問題：首頁的「推薦商品」區塊在 render 時丟出錯誤，整個 React 樹都被卸載，連購物車和結帳按鈕都不見了。
// 要求：
//   1. 子孫元件在 render 時丟出錯誤，就改畫 fallback({ error, reset }) 的結果；邊界外面的元件照常顯示
//   2. 丟出來的不是 Error（例如 throw '逾時'）時，交給 fallback 的 error 要包成 Error，message 是 String(值)
//   3. 每個被攔到的錯誤呼叫 onError 一次（有傳才呼叫），參數是「原本丟出來的值」和 componentStack 字串
//      getDerivedStateFromError 只負責算出新的 state，不能有副作用（React 可能呼叫它不只一次，19.3.1 實測是兩次）
//   4. reset() 清掉錯誤、重新畫 children；如果又出錯，再顯示 fallback
// 型別 Props、FallbackProps 不要改
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
    this.props.onError?.(error instanceof Error ? error : new Error(String(error)), info.componentStack ?? '')
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
