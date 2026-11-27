import { useSearchParams } from 'react-router'
import type { Category } from '../../helpers/fake-api.ts'

export type MenuCategory = 'all' | Category

const CATEGORIES: readonly string[] = ['coffee', 'tea', 'food']
const isCategory = (value: string): value is Category => CATEGORIES.includes(value)

export function useMenuQuery() {
  const [params, setParams] = useSearchParams()

  // 每次 render 都從網址算出來：網址是唯一的來源
  const values = params.getAll('category')
  const category = (params.get('category') ?? 'all') as MenuCategory
  const keyword = (params.get('q') ?? '').trim()

  // 只改自己的鍵，其他鍵原樣保留；篩選不新增歷史紀錄
  function update(key: string, value: string | null) {
    setParams(prev => {
      if (value === null) prev.delete(key)
      else prev.set(key, value)
      return prev
    }, { replace: true })
  }

  return {
    category,
    keyword,
    setCategory: (value: MenuCategory) => update('category', value === 'all' ? null : value),
    setKeyword: (text: string) => update('q', text.trim() || null),
  }
}
