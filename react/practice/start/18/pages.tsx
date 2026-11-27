// 練習 1 用的頁面（不用改）
import { useParams } from 'react-router'

export function Home() {
  return <h1>歡迎光臨</h1>
}
export function MenuPage() {
  return <h1>菜單</h1>
}
export function ProductPage() {
  const { id } = useParams()
  return <h1>商品 #{id}</h1>
}
export function AdminHome() {
  return <h1>後台總覽</h1>
}
export function OrdersPage() {
  return <h1>訂單管理</h1>
}
export function NotFound() {
  return <h1>找不到頁面</h1>
}
