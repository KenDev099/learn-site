// 練習 1：useEventListener
// 問題：好幾個元件都要「掛上事件、離開時拿掉」（按 Esc 關閉、點外面收合、視窗大小改變），每個元件各寫一次又常忘了移除。
//       起始程式只在一開始讀一次 target、用 onUnmounted 移除：放在 effectScope 裡永遠不會移除（Vue 還會警告），
//       target 是 template ref 時，一開始是 null，之後換成元素也不會註冊。
// 要求：
//   1. target 可以是元素（EventTarget）、ref 或 getter；值是 null／undefined 時什麼都不做
//   2. 在 target 上 addEventListener(type, handler)
//   3. target 換成另一個元素時：從舊元素移除、在新元素註冊
//   4. 所屬的 scope 停止時移除（元件卸載、effectScope().stop() 都算）；不能用 onUnmounted
//   5. 不能出現 Vue 警告
import { onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'

export function useEventListener(
  target: MaybeRefOrGetter<EventTarget | null | undefined>,
  type: string,
  handler: (event: Event) => void,
) {
  const el = toValue(target)
  el?.addEventListener(type, handler)
  onUnmounted(() => el?.removeEventListener(type, handler))
}
