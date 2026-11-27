// 已經寫好，不用改：這一課要用到的前幾課程式，抄在這裡，這一題不必依賴別題的 work 資料夾
// - redactPII：第 12 課練習 2（遮蔽電話、Email、卡號）
// - PRICES、costOf：第 13 課練習 1（從 usage 算出美元費用；這裡只留一般請求，沒有批次與 1 小時快取）
import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'
export const SYSTEM = '你是咖啡店的客服助理，用繁體中文簡短回答。'

export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'

// 每百萬 token 的美元價格（2026-11-01 官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing）
export const PRICES: Record<ModelId, { input: number; output: number; write5m: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, write5m: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, write5m: 0.125, cacheRead: 0.01 },
}

// 美元，四捨五入到小數第 6 位（Haiku 5.5 超過 10 萬 token 的長 prompt 價這裡省略，第 13 課有完整版）
export function costOf(usage: Anthropic.Usage, model: ModelId): number {
  const p = PRICES[model]
  const usd = (usage.input_tokens * p.input + usage.output_tokens * p.output
    + (usage.cache_creation_input_tokens ?? 0) * p.write5m + (usage.cache_read_input_tokens ?? 0) * p.cacheRead) / 1_000_000
  return Math.round(usd * 1e6) / 1e6
}

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

// 台灣手機 → [電話]、Email → [Email]、通過 Luhn 的 13～19 碼卡號 → [卡號]
export function redactPII(text: string): string {
  return text
    .replace(/(?<!\d[ -]?)\d(?:[ -]?\d){12,18}(?![ -]?\d)/g, m => luhn(m.replace(/\D/g, '')) ? '[卡號]' : m)
    .replace(/(?<!\d)09\d{2}[ -]?\d{3}[ -]?\d{3}(?!\d)/g, '[電話]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[Email]')
}
