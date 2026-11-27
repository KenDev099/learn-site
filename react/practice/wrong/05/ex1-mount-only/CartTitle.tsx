// 錯誤：當成 onMounted，依賴陣列是空的，用 eslint-disable 蓋掉
import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${shopName}` : shopName
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <p>購物車有 {count} 項</p>
}
