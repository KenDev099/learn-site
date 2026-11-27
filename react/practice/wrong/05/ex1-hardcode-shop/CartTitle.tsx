// 錯誤：店名照範例寫死，lint 看不出來
import { useEffect } from 'react'

export function CartTitle({ count }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) 咖啡店` : '咖啡店'
  }, [count])
  return <p>購物車有 {count} 項</p>
}
