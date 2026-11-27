// 練習 4：菜單區塊 MenuSection（Suspense ＋ ErrorBoundary ＋ 重試）
// 先完成練習 3：這一題要用你寫的 ErrorBoundary。
// 問題：菜單 API 一直被重複呼叫；API 失敗時錯誤沒人攔，整頁（連旁邊的購物車）都不見了，也沒辦法重試。
// 要求：
//   1. 掛載時呼叫 api.getMenu() 一次（不是每次 render 都呼叫）；MenuSection 重新 render 不能再呼叫
//   2. 載入中在菜單的位置顯示 <p role="status">載入菜單中…</p>；標題「菜單」一直留在畫面上
//   3. 成功：MenuList 用 use() 讀出菜單，每個商品一個 <li>「品名 $價格」
//   4. 失敗：用 ErrorBoundary 只包住菜單的部分，顯示 <p role="alert">菜單載入失敗：錯誤的 message</p>
//      和一個「重試」按鈕；MenuSection 外面的元件照常顯示
//   5. 按「重試」：重新呼叫一次 api.getMenu()、回到載入中，成功就顯示菜單；又失敗就再顯示錯誤，可以一直重試
// 不能做的事：在 render 的過程中呼叫 api.getMenu()；在 use() 外面包 try/catch
import { Suspense, use, useState } from 'react'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'

export function MenuList({ menuPromise }: { menuPromise: Promise<Product[]> }) {
  const menu = use(menuPromise)
  return (
    <ul aria-label="菜單">
      {menu.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}

export function MenuSection({ api }: { api: Pick<FakeMenuApi, 'getMenu'> }) {
  // 初始化函式只在第一次 render 執行。MenuSection 自己不會暫停（Suspense 在它裡面），state 會保留
  const [menuPromise, setMenuPromise] = useState(() => api.getMenu())
  return (
    <section>
      <h2>菜單</h2>
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <>
            <p role="alert">菜單載入失敗：{error.message}</p>
            <button
              type="button"
              onClick={() => {
                setMenuPromise(api.getMenu())   // 失敗的 Promise 永遠是失敗的：要換一個新的請求
              }}
            >
              重試
            </button>
          </>
        )}
      >
        <Suspense fallback={<p role="status">載入菜單中…</p>}>
          <MenuList menuPromise={menuPromise} />
        </Suspense>
      </ErrorBoundary>
    </section>
  )
}
