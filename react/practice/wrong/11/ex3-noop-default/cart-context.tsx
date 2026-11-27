// 錯在：dispatch 的 context 拿空函式當預設值：忘了放 CartProvider 時按「加入」沒反應，也沒有錯誤
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react'
import { cartReducer, type CartAction, type CartLine } from './cart-reducer.ts'

// 會變的（lines）和不會變的（dispatch）分開：只拿 dispatch 的元件不訂閱 lines
const CartContext = createContext<readonly CartLine[] | null>(null)
const CartDispatchContext = createContext<Dispatch<CartAction>>(() => {})

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  return (
    <CartContext value={lines}>
      <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
    </CartContext>
  )
}

export function useCart(): readonly CartLine[] {
  const lines = use(CartContext)
  if (!lines) throw new Error('useCart() 必須在 <CartProvider> 之下使用')
  return lines
}

export function useCartDispatch(): Dispatch<CartAction> {
  return use(CartDispatchContext)
}
