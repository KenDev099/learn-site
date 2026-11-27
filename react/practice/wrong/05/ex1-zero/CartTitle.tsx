// 錯誤：count 是 0 時顯示「(0) 咖啡店」
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = `(${count}) ${shopName}`
  }, [count, shopName])
  return <p>購物車有 {count} 項</p>
}
