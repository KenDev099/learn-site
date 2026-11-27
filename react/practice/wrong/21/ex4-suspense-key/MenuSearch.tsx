/*
練習 4：搜尋時留著舊結果：useDeferredValue 加 Suspense
問題：
  線上點餐的商品搜尋。SearchResults 用 use() 讀搜尋結果，外面包 Suspense。
  現在每打一個字，結果區就換成「搜尋中…」，等回應回來才又出現，畫面一直閃。
要求：
  1. 輸入框永遠立刻顯示打的字（不能因為在等資料就停住）
  2. 等新結果時，畫面上留著上一次的內容（上一次的結果，或一開始的提示），不顯示「搜尋中…」；
     新結果到了才換掉。用 useDeferredValue，交給 SearchResults 的關鍵字要用延後的那個值
  3. 畫面上的內容跟輸入框不一致時（還在等），<div role="region" aria-label="搜尋結果區"> 加上 aria-busy="true"；
     一致了是 "false"
  4. 去掉前後空白後是空字串時不搜尋，顯示 <p>輸入品名開始搜尋</p>
  5. 搜尋過的關鍵字（例如刪字回到「拿」）直接顯示快取的結果，不再呼叫 api.search
不能做的事：
  - 不要改 search-cache.ts、SearchResults.tsx
*/
import { Suspense, useDeferredValue, useState } from 'react'
import { SearchResults } from './SearchResults.tsx'
import type { SearchCache } from './search-cache.ts'

export function MenuSearch({ cache }: { cache: SearchCache }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const keyword = deferredQuery.trim()      // 結果區只看延後的值
  const stale = query !== deferredQuery

  return (
    <section>
      <label>
        搜尋商品
        <input value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <div role="region" aria-label="搜尋結果區" aria-busy={stale}>
        <Suspense key={keyword} fallback={<p role="status">搜尋中…</p>}>
          {keyword ? <SearchResults cache={cache} keyword={keyword} /> : <p>輸入品名開始搜尋</p>}
        </Suspense>
      </div>
    </section>
  )
}
