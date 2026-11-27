import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary.tsx'

// 推薦商品區塊：broken.value 不是 null 時，在 render 時把它丟出來
const broken: { value: unknown } = { value: null }
function Recommendations() {
  if (broken.value !== null) throw broken.value
  return <ul aria-label="推薦商品"><li>可頌</li><li>起司蛋糕</li></ul>
}

const onError = vi.fn<(error: unknown, componentStack: string) => void>()
beforeEach(() => {
  broken.value = null
  onError.mockClear()
  // React 會把被攔到的錯誤印到 console.error，這裡先關掉，輸出比較好讀
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function Home({ report = true }: { report?: boolean }) {
  return (
    <>
      <header>購物車：2 件</header>
      <ErrorBoundary
        onError={report ? onError : undefined}
        fallback={({ error, reset }) => (
          <div role="alert">
            推薦商品暫時無法顯示：{error.message}
            <button type="button" onClick={reset}>重試</button>
          </div>
        )}
      >
        <Recommendations />
      </ErrorBoundary>
    </>
  )
}

function show(ui = <Home />) {
  try {
    render(ui)
  } catch (e) {
    throw new Error(`錯誤沒有被 ErrorBoundary 攔下來，整個畫面都壞了（${String(e)}）：加上 static getDerivedStateFromError，回傳 { error }，render 時有 error 就畫 fallback`)
  }
}

describe('練習 3：ErrorBoundary 攔下 render 錯誤、回報、重試', () => {
  test('沒有錯誤時照常顯示 children，不呼叫 onError', () => {
    show()
    expect(screen.getByRole('list', { name: '推薦商品' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  test('子元件 render 時丟錯：改顯示 fallback，邊界外面的購物車還在', () => {
    broken.value = new Error('推薦服務逾時')
    show()
    expect(screen.getByRole('alert'), 'fallback 要收到 error，顯示它的 message').toHaveTextContent('推薦商品暫時無法顯示：推薦服務逾時')
    expect(screen.queryByRole('list', { name: '推薦商品' })).toBeNull()
    expect(screen.getByText('購物車：2 件'), '邊界外面的元件不受影響').toBeInTheDocument()
  })

  test('onError 對每個錯誤只呼叫一次，收到原本的錯誤和 componentStack', () => {
    const error = new Error('推薦服務逾時')
    broken.value = error
    show()
    expect(onError, 'onError 要剛好呼叫一次：回報寫在 componentDidCatch。寫在 getDerivedStateFromError 裡的話，React 會呼叫它兩次').toHaveBeenCalledTimes(1)
    const [received, stack] = onError.mock.calls[0]
    expect(received, 'onError 的第一個參數要是原本丟出來的錯誤物件').toBe(error)
    expect(typeof stack === 'string' && stack.includes('Recommendations'), 'onError 的第二個參數要是 info.componentStack（裡面會有出錯的元件名稱 Recommendations）').toBe(true)
  })

  test('丟出來的不是 Error：fallback 拿到包好的 Error，onError 拿到原本的值', () => {
    broken.value = '逾時'
    show()
    expect(screen.getByRole('alert'), '丟出字串「逾時」時，fallback 的 error.message 要是「逾時」：在 getDerivedStateFromError 裡用 new Error(String(error)) 包起來').toHaveTextContent('推薦商品暫時無法顯示：逾時')
    expect(onError.mock.calls[0]?.[0], 'onError 要收到原本丟出來的值（字串「逾時」），不要送包過的 Error').toBe('逾時')
  })

  test('沒傳 onError 也不會壞', () => {
    broken.value = new Error('推薦服務逾時')
    show(<Home report={false} />)
    expect(screen.getByRole('alert'), '沒傳 onError 時用 this.props.onError?.(…)，不要直接呼叫').toHaveTextContent('推薦服務逾時')
  })

  test('重試：還沒修好就再顯示 fallback；修好之後顯示 children', async () => {
    const user = userEvent.setup()
    broken.value = new Error('推薦服務逾時')
    show()
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(screen.getByRole('alert'), '還是壞的，重試後要再顯示 fallback').toBeInTheDocument()
    expect(onError, '重試後又出錯，onError 要再被呼叫一次（共兩次）').toHaveBeenCalledTimes(2)
    broken.value = null
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(screen.queryByRole('alert'), '按「重試」要把 state 的 error 清成 null：reset 用 this.setState({ error: null })').toBeNull()
    expect(screen.getByRole('list', { name: '推薦商品' }), '清掉錯誤之後要重新畫出 children').toBeInTheDocument()
  })

  test('兩個邊界各自記錄自己的錯誤', async () => {
    function Ok() { return <p>購物車</p> }
    broken.value = new Error('推薦服務逾時')
    show(<>
      <ErrorBoundary fallback={() => <p role="alert">推薦壞了</p>}><Recommendations /></ErrorBoundary>
      <ErrorBoundary fallback={() => <p role="alert">購物車壞了</p>}><Ok /></ErrorBoundary>
    </>)
    expect(screen.getAllByRole('alert').map(a => a.textContent), '只有推薦商品的邊界要顯示 fallback：錯誤存在元件自己的 state，不要放在元件外面或 static 欄位').toEqual(['推薦壞了'])
    expect(screen.getByText('購物車')).toBeInTheDocument()
    await act(async () => {})
  })
})
