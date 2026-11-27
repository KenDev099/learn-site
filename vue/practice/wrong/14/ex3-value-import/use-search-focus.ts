// 練習 3（之一）：useSearchFocus：在 composable 裡取得 SearchBox 的 template ref
// 問題：SearchPage 呼叫 useSearchFocus('box')，範本上的 <SearchBox ref="box" /> 就會放進這個 ref。
//       現在寫成 useTemplateRef<any>(key)：box.value?.focus() 能跑，但打錯方法名稱（box.value?.open()）也不會報錯。
//       在 .vue 檔裡，vue-tsc 會依範本自動推論 useTemplateRef 的型別；在 composable（.ts 檔）裡推論不到，要自己寫。
// 要求：
//   1. 把 any 換成 SearchBox 元件實例的型別，讓 box.value?.focus() 通過、box.value?.open() 報錯
//   2. 只 import 型別（import type），composable 不需要在執行時載入 SearchBox
//   3. 行為不變：focusSearch() 讓游標跳進搜尋框
import { useTemplateRef } from 'vue'
import SearchBox from './SearchBox.vue'

export function useSearchFocus(key: string) {
  const box = useTemplateRef<InstanceType<typeof SearchBox>>(key)

  function focusSearch() {
    box.value?.focus()
  }

  return { box, focusSearch }
}
