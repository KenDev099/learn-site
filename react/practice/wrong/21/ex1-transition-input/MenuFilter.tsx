/*
練習 1：打字不卡：useDeferredValue 讓很慢的商品格晚一拍跟上
問題：
  點餐機的「篩選商品」輸入框，每打一個字，很慢的 ProductGrid 就整個重新 render，
  舊平板上字要過一下子才出現在輸入框裡。
要求：
  1. 輸入框永遠立刻顯示打的字；商品格可以晚一拍：先 commit 一次「輸入框是新的、商品格還是舊的」，
     再 commit 一次「商品格跟上」。用 useDeferredValue
  2. 商品格還沒跟上時，<section aria-label="商品"> 加上 aria-busy="true"；跟上了是 "false"
  3. 每打一個字，ProductGrid 只 render 一次（在背景那一次）；輸入框先更新的那一次不能 render 它。
     在這個檔案的模組層級用 memo 包住 ProductGrid（不要改 ProductGrid.tsx）
  4. 不要用 setTimeout 做 debounce：打完字，商品格要馬上跟上，不用等固定的時間
*/
import { memo, startTransition, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { ProductGrid } from './ProductGrid.tsx'

const Grid = memo(ProductGrid)   // 模組層級包一次：輸入框先更新的那次 render，keyword 還是舊的，Grid 跳過

export function MenuFilter({ products }: { products: readonly Product[] }) {
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = keyword
  const stale = keyword !== deferredKeyword

  return (
    <>
      <label>
        篩選商品
        <input value={keyword} onChange={e => { const v = e.target.value; startTransition(() => setKeyword(v)) }} />
      </label>
      <section aria-label="商品" aria-busy={stale}>
        <Grid products={products} keyword={deferredKeyword} />
      </section>
    </>
  )
}
