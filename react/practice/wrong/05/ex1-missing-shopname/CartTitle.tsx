// 錯誤：漏了 shopName（沒有蓋掉警告）
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${shopName}` : shopName
  }, [count])
  return <p>購物車有 {count} 項</p>
}
