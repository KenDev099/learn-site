/*
練習 1：把 state 放到對的地方（MenuPage）
問題：
  1. 搜尋框的草稿 draft 放在 MenuPage：每打一個字，整頁連同每一張 ProductCard 都重新 render
  2. CategoryTabs 和 ProductList 各有一份 category：點「茶」，按鈕亮了，清單卻沒變
要求：
  1. 草稿（輸入框裡還沒送出的文字）只放在 SearchBox：打字時 ProductCard 不能重新 render
  2. 送出搜尋表單（按「搜尋」或在輸入框按 Enter）時，SearchBox 用 onSearch(text) 通知 MenuPage；
     MenuPage 存「送出的關鍵字」，清單只顯示品名包含關鍵字（去掉前後空白）的商品，空白關鍵字顯示全部。
     還沒送出的草稿不影響清單
  3. category 只留一份，放在 MenuPage（兄弟元件共用 → 提升到共同的父元件）：
     CategoryTabs 從 props 讀目前的分類、用 onChange 往上通知；ProductList 收篩選好的商品
  4. 分類與關鍵字同時生效；商品從 props 的 products 來，不要 import 假資料
  5. 畫面結構不變：<form role="search">、label「搜尋商品」的輸入框、「搜尋」按鈕；
     分類按鈕「全部／咖啡／茶／點心」用 aria-pressed 表示選中；清單 <ul aria-label="商品"> 裡每項是 <ProductCard>；
     沒有商品時顯示 <p>沒有符合的商品</p>
不能做的事：
  - 不要改 ProductCard.tsx，也不要用 memo 擋下 render（這題要的是把 state 放對位置，memo 留到第 19 課）
  - 不能把草稿放在模組層級的變數
*/
import { useState } from 'react'
import type { Category, Product } from '../../helpers/fake-api.ts'
import { ProductCard } from './ProductCard.tsx'

type Filter = 'all' | Category

const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

export function MenuPage({ products }: { products: readonly Product[] }) {
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const shown = products.filter(p => p.name.includes(keyword.trim()))

  return (
    <main>
      <form role="search" onSubmit={e => { e.preventDefault(); setKeyword(draft) }}>
        <label>搜尋商品 <input value={draft} onChange={e => setDraft(e.target.value)} /></label>
        <button type="submit">搜尋</button>
      </form>
      <CategoryTabs />
      <ProductList products={shown} />
    </main>
  )
}

function CategoryTabs() {
  const [category, setCategory] = useState<Filter>('all')
  return (
    <div>
      {TABS.map(t => (
        <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => setCategory(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ProductList({ products }: { products: readonly Product[] }) {
  const [category] = useState<Filter>('all')
  const shown = products.filter(p => category === 'all' || p.category === category)
  if (shown.length === 0) return <p>沒有符合的商品</p>
  return (
    <ul aria-label="商品">
      {shown.map(p => <ProductCard key={p.id} product={p} />)}
    </ul>
  )
}
