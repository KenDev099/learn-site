// 錯誤：沒寫依賴陣列，每次 render 之後都重寫一次
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${shopName}` : shopName
  })
  return <p>購物車有 {count} 項</p>
}
