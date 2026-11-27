// 錯誤：漏了 shopName，用 eslint-disable 蓋掉警告
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${shopName}` : shopName
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])
  return <p>購物車有 {count} 項</p>
}
