// 練習 3：在 token 預算內組出有編號的資料區塊
// Ranked：重排之後的候選，依 score 由高到低排好（score 是重排分數，0～1，越高越相關）
export type Ranked = { id: string; headingPath: string[]; content: string; score: number }
export type Context = {
  text: string        // 放進 <documents> 裡的內容：每段一個 <doc>，用 '\n' 連接
  ids: string[]       // 這次放進去的短 id，依序 'c1'、'c2'…
  chunks: Ranked[]    // 跟 ids 一一對應：ids[i] 指的是 chunks[i]，之後才查得回是哪一塊
}

// 第 4 課的跳脫（已經寫好，不用改）：內容用 escapeForTag；放在屬性（title="…"）裡的再多跳脫雙引號
export function escapeForTag(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
export function escapeAttr(text: string): string {
  return escapeForTag(text).replaceAll('"', '&quot;')
}

// 依 chunks 的順序一段一段放：每段是 <doc id="c1" title="門市手冊 › 過敏原">內容</doc>
//   title 是 headingPath 用 ' › ' 連接（escapeAttr），內容用 escapeForTag
//   這一段的 token 數是 countTokens(整段 <doc …>…</doc>)；加上去會超過 budgetTokens 就整段不放，繼續看下一段
//   id 依「放進去的順序」編號，跳過的不佔號
export function buildContext(chunks: Ranked[], budgetTokens: number, countTokens: (s: string) => number): Context {
  const parts: string[] = []
  const ids: string[] = []
  const used: Ranked[] = []
  let total = 0
  for (const [i, chunk] of chunks.entries()) {
    const id = `c${i + 1}`
    const part = `<doc id="${id}" title="${escapeAttr(chunk.headingPath.join(' › '))}">${escapeForTag(chunk.content)}</doc>`
    const cost = countTokens(part)
    if (total + cost > budgetTokens) continue   // 不切半段；後面較短的可能還放得下
    total += cost
    parts.push(part)
    ids.push(id)
    used.push(chunk)
  }
  return { text: parts.join('\n'), ids, chunks: used }
}
