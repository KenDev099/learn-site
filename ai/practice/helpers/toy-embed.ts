// 玩具 embedding：不是語意模型，只是讓「字面相近的字串，向量也相近」，用來練 RAG 的管線（切塊、存向量、搜尋、排序）
// 做法：連續的中文字取相鄰兩字（bigram，只有一個字就取那個字）、英文與數字取整個單字（轉小寫），
// 每個片段用 FNV-1a 雜湊到 0..dim-1 的某一維加 1，最後做 L2 正規化（長度變成 1）。完全確定、離線
// 沒有任何片段（空字串、只有標點）時回傳全 0 的向量
export function toyEmbed(text: string, dim = 64): number[] {
  const v = new Array<number>(dim).fill(0)
  for (const piece of pieces(text)) v[fnv1a(piece) % dim] += 1
  const len = Math.hypot(...v)
  return len === 0 ? v : v.map(x => x / len)
}

function pieces(text: string): string[] {
  const out: string[] = []
  for (const [run] of text.toLowerCase().matchAll(/\p{Script=Han}+|[a-z0-9]+/gu)) {
    if (!/\p{Script=Han}/u.test(run)) { out.push(run); continue }
    const chars = [...run]
    if (chars.length === 1) out.push(run)
    for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1])
  }
  return out
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(s)) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  return h
}

// 兩個向量的 cosine 相似度（-1～1）；toyEmbed 的結果已經正規化，所以等於內積
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}
