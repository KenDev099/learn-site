import { Suspense, use, useState, useTransition } from 'react'
import type { Category } from '../../helpers/fake-api.ts'
import type { CategoryApi } from './menu-api.ts'

const TABS: readonly { value: Category; label: string }[] = [
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

// 錯誤：在 render 裡呼叫 API 建立 Promise
function MenuList({ api, category }: { api: CategoryApi; category: Category }) {
  const items = use(api.getCategory(category))
  return (
    <ul aria-label="菜單">
      {items.map(p => <li key={p.id}>{p.name} ${p.price}</li>)}
    </ul>
  )
}

export function CategoryMenu({ api }: { api: CategoryApi }) {
  const [category, setCategory] = useState<Category>('coffee')
  const [isPending, startTransition] = useTransition()
  return (
    <section>
      <div>
        {TABS.map(t => (
          <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => startTransition(() => setCategory(t.value))}>
            {t.label}
          </button>
        ))}
      </div>
      {isPending && <p role="status">切換中…</p>}
      <Suspense fallback={<p role="status">載入菜單中…</p>}>
        <MenuList api={api} category={category} />
      </Suspense>
    </section>
  )
}
