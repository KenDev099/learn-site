/*
練習 2（之二）：換頁之後，焦點移到新頁面的 h1
問題：
  用鍵盤或讀螢幕軟體的客人點了「購物車」，畫面換了，焦點卻還停在導覽列的連結上，
  讀螢幕軟體什麼都沒唸，客人不知道頁面已經換了。
要求：
  1. 網址的 pathname 改變（換到別頁）之後，把焦點移到 <main> 裡的 <h1>
  2. 第一次載入（還沒換過頁）不要移動焦點；在 StrictMode 下也一樣
  3. 同一頁只改了 ?q= 這類搜尋參數時不要移動焦點：在菜單頁的搜尋框打字，焦點要留在搜尋框
  4. 不要改 pages.tsx、routes.tsx
*/
import { Link, Outlet } from 'react-router'

export function ShopLayout() {
  return (
    <>
      <nav aria-label="主選單">
        <Link to="/menu">菜單</Link> <Link to="/cart">購物車</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  )
}
