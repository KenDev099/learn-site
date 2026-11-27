/*
練習 2：把菜單的篩選放進網址（useMenuQuery）
問題：分類和關鍵字現在存在 useState：店長把「只看茶」的網址傳給同事，對方打開看到的是全部；
      從商品頁按上一頁回來，篩選也回到預設值。
要求：
  1. 用 react-router 的 useSearchParams，回傳 { category, keyword, setCategory, setKeyword }
  2. category 從 ?category= 讀：只接受 'coffee'、'tea'、'food'；
     沒有這個鍵、值不在清單裡、同一個鍵出現兩次以上，都當成 'all'
  3. keyword 從 ?q= 讀，去掉前後空白；沒有就是 ''
  4. setCategory(c)：'all' 時刪掉 category 這個鍵，其他值寫入 category
     setKeyword(text)：去掉前後空白；空字串時刪掉 q，否則寫入 q
     兩個都要保留網址上其他的鍵（例如 page、store），路徑不變，
     而且用 replace：不新增歷史紀錄，按上一頁直接回到進菜單之前的頁面
  5. 網址是唯一的來源：不要把 category、keyword 另外存一份 state；
     使用者按上一頁、點了另一個帶 query 的連結時，回傳值要跟著網址變
  6. 型別：category 是 MenuCategory；setCategory 只收 MenuCategory，setCategory('cake') 要是型別錯誤
*/
import { useState } from 'react'
import type { Category } from '../../helpers/fake-api.ts'

export type MenuCategory = 'all' | Category

export function useMenuQuery() {
  const [category, setCategory] = useState<MenuCategory>('all')
  const [keyword, setKeyword] = useState('')
  return {
    category,
    keyword,
    setCategory: (value: MenuCategory) => setCategory(value),
    setKeyword: (text: string) => setKeyword(text.trim()),
  }
}
