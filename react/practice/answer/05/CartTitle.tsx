import { useEffect } from 'react'

export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${shopName}` : shopName
  }, [count, shopName])   // effect 讀了這兩個 props，就兩個都列：任何一個變了才重新同步

  return <p>購物車有 {count} 項</p>
}
