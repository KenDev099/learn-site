// 練習 2：點餐備註自動存草稿（防抖、深層監聽、清理）
// 問題：起始程式只監聽 note，改甜度不會存；連續打字每個字都存一次；
//       存進去的是 reactive proxy，之後再改表單，已存的草稿也跟著變；元件卸載後計時器還會存檔。
// 要求：
//   1. form 的任何欄位（包括巢狀的 options.sugar、options.ice）改變後，等 delay 毫秒（預設 800）呼叫一次 save(draft)
//   2. 在 delay 內連續修改，只存最後一次（每次改動都取消上一個計時器）
//   3. draft 是當下內容的普通物件複本：不是 proxy，之後再改 form 不會影響它
//      （structuredClone 不能直接複製 reactive 物件，會丟 DataCloneError，先用 toRaw 取出原物件）
//   4. 所屬的 effect scope 停止（例如元件卸載）後，不能再存檔，也不能留下計時器
import { toRaw, watch } from 'vue'

export type OrderForm = {
  note: string
  options: { sugar: '正常' | '半糖' | '無糖'; ice: '正常' | '少冰' | '去冰' }
}

export function useDraftAutosave(form: OrderForm, save: (draft: OrderForm) => void, { delay = 800 } = {}) {
  watch(form, () => {
    setTimeout(() => save(structuredClone(toRaw(form))), delay)
  })
}
