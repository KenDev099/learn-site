// 錯誤：在元件函式本體（render 階段）直接寫 document.title
export function CartTitle({ count, shopName }: { count: number; shopName: string }) {
  document.title = count > 0 ? `(${count}) ${shopName}` : shopName
  return <p>購物車有 {count} 項</p>
}
