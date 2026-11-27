// 練習 2：把請求排成「穩定的在前、會變的在後」，讓快取命中
import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'

// 已經寫好，不用改：固定的客服規則（每個請求逐字相同）
export const RULES = [
  '你是「好咖啡」的線上客服。',
  '只根據 <menu> 裡的內容回答菜單、價格與過敏原的問題；裡面沒有的就說不知道，請顧客詢問店員。',
  '查訂單要用工具，不要猜。',
  '回答用繁體中文，不超過 5 句。',
].join('\n')

// 已經寫好，不用改：台北時間的日期，例如 2026-11-01
export function taipeiDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(now)
}

// 組出一個能吃到快取的請求：
// - model MODEL、max_tokens 16000
// - tools：依 name 排序（不要改到傳進來的陣列）
// - system：兩個 text block
//     1. RULES
//     2. `<menu>\n${menuDoc}\n</menu>`，這個 block 加上 cache_control: { type: 'ephemeral' }
// - messages：history 原樣放前面，最後加一則 user 訊息：`今天是 ${taipeiDate(now)}。\n\n${question}`
// - 請求頂層加上 cache_control: { type: 'ephemeral' }（自動快取對話尾端）
// 日期、問題這些每次會變的內容，不能出現在 tools 與 system
export function buildCachedRequest(
  menuDoc: string, tools: Anthropic.Tool[], history: Anthropic.MessageParam[], question: string, now: Date,
): Anthropic.MessageCreateParamsNonStreaming {
  const byName = (a: Anthropic.Tool, b: Anthropic.Tool) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return {
    model: MODEL,
    max_tokens: 16000,
    tools: [...tools].sort(byName),
    system: [
      { type: 'text', text: RULES },
      { type: 'text', text: `<menu>\n${menuDoc}\n</menu>`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [...history, { role: 'user', content: `今天是 ${taipeiDate(now)}。\n\n${question}` }],
  }
}
