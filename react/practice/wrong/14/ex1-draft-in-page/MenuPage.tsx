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
  // 兩個子元件都要用的放在這裡；草稿只有 SearchBox 用，留在 SearchBox
  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<Filter>('all')
  const q = keyword.trim()
  const shown = products.filter(p => (category === 'all' || p.category === category) && p.name.includes(q))

  return (
    <main>
      <SearchBox draft={draft} onDraft={setDraft} onSearch={setKeyword} />
      <CategoryTabs value={category} onChange={setCategory} />
      <ProductList products={shown} />
    </main>
  )
}

function SearchBox({ draft, onDraft: setDraft, onSearch }: { draft: string; onDraft: (v: string) => void; onSearch: (text: string) => void }) {
  return (
    <form role="search" onSubmit={e => { e.preventDefault(); onSearch(draft) }}>
      <label>搜尋商品 <input value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <button type="submit">搜尋</button>
    </form>
  )
}

function CategoryTabs({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div>
      {TABS.map(t => (
        <button key={t.value} type="button" aria-pressed={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ProductList({ products }: { products: readonly Product[] }) {
  if (products.length === 0) return <p>沒有符合的商品</p>
  return (
    <ul aria-label="商品">
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </ul>
  )
}
