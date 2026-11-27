// 練習 4（上）：用 onRenderTracked 記下「為什麼重新渲染」
// 要求：
//   1. 寫出 useRenderLog(log)：在呼叫它的元件裡註冊 onRenderTracked
//   2. 每次觸發都在 log 後面加一筆 { key, type }：key 是 e.key 轉成字串，type 是 e.type（set、add、delete…）
//   3. 只在元件的 setup 裡呼叫；onRenderTracked 只在開發模式有效，正式環境不會執行
// 寫好之後，暫時在 CartBadge.vue 的 setup 裡呼叫 useRenderLog，看看改 note 時記到了什麼
import { onRenderTracked } from 'vue'

export type RenderLogEntry = { key: string; type: string }

export function useRenderLog(log: RenderLogEntry[]) {
  onRenderTracked(e => {
    log.push({ key: String(e.key), type: e.type })
  })
}
