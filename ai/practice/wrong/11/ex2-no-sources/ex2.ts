// 練習 2：用程式評分一題 RAG 回答
export type Severity = 'critical' | 'normal'

// eval 集的一筆案例
export type EvalCase = {
  id: string
  question: string
  mustInclude: string[]     // 回答必須包含的事實，例如 ['110']
  mustCite: string[]        // 必須引用的文件 id，例如 ['menu']
  shouldAbstain: boolean    // true：這題應該拒答（轉店員）
  severity: Severity        // critical：價格、過敏原、退款這類答錯會出事的
}

// 助理（第 10 課的 RAG 管線）的輸出：sources 已經從 c1、c2 換回文件 id
export type AssistantOutput = {
  status: 'answered' | 'abstain'
  answer: string
  sources: string[]
}

export type Grade = { pass: boolean; reasons: string[] }

// 比對前的正規化：全形數字、全形英文轉半形，去掉所有空白（含全形空白）
export function normalize(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '')
}

// 評分規則：
//   shouldAbstain 為 true：status 是 abstain 才過；回答了就不過，reasons 寫「應該拒答」
//   shouldAbstain 為 false：status 是 abstain 就不過，reasons 寫「不應該拒答」
//     否則逐一檢查，列出「所有」不符的地方，不要遇到第一個就回傳：
//       每個 mustInclude 正規化後都要出現在正規化後的 answer 裡，缺的寫「缺少：<那個字串>」
//       每個 mustCite 都要在 sources 裡（多引用不扣分），缺的寫「沒有引用：<文件 id>」
//   pass 是 reasons 為空
export function gradeAnswer(c: EvalCase, out: AssistantOutput): Grade {
  if (c.shouldAbstain) {
    return out.status === 'abstain' ? { pass: true, reasons: [] } : { pass: false, reasons: ['應該拒答'] }
  }
  if (out.status === 'abstain') return { pass: false, reasons: ['不應該拒答'] }
  const reasons: string[] = []
  const answer = normalize(out.answer)
  for (const fact of c.mustInclude) if (!answer.includes(normalize(fact))) reasons.push(`缺少：${fact}`)
  return { pass: reasons.length === 0, reasons }
}
