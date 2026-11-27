// 練習 4：新舊版本同時在線時，哪些變更可以直接滾動更新、哪些要先 expand 再 contract
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readJson } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex4')
const CODES = ['expand', 'dual-write', 'backfill', 'contract-later', 'version-message']
// 每個情境的判斷，以及判錯時的提示（不直接給答案，只提醒要想的方向）
const KEY: Record<string, { safe: boolean, steps: string[], hint: string }> = {
  'remove-response-field': { safe: false, steps: ['contract-later'], hint: '更新期間與更新之後，舊版前端、使用者手機上的舊版 App 還在讀這個欄位' },
  'add-nullable-column': { safe: true, steps: [], hint: '舊版的 INSERT 不寫這個欄位會怎樣？可為 NULL 的欄位有影響嗎' },
  'rename-not-null-column': { safe: false, steps: ['expand', 'dual-write', 'backfill', 'contract-later'], hint: '舊版 Pod 還在讀寫 total；新版寫進來的訂單，舊版讀得到嗎？NOT NULL 的 total 沒人寫會怎樣？最後誰負責把 total 收掉' },
  'change-queue-message': { safe: false, steps: ['version-message'], hint: '佇列裡還有舊格式的訊息，新舊兩版的 worker 同時在消費' },
  'add-endpoint': { safe: true, steps: [], hint: '只新增、不改舊的：舊版客戶端根本不會呼叫它' },
  'log-add-field': { safe: true, steps: [], hint: 'JSON log 多一個欄位，既有的查詢會壞嗎' },
}

test('review.json：每個情境的判斷、必要步驟與理由', { timeout: 10_000 }, () => {
  const review = readJson(dir, 'review.json')
  const list: any[] = review.changes
  assert(Array.isArray(list), 'review.json 要保留 changes 陣列')
  assert.deepEqual(list.map(c => c.id).sort(), Object.keys(KEY).sort(), 'changes 的 id 不要改、不要刪，6 個情境都要在')
  for (const c of list) {
    const k = KEY[c.id]
    assert.equal(typeof c.safeForRollingUpdate, 'boolean', `${c.id}：safeForRollingUpdate 要填 true 或 false`)
    assert(Array.isArray(c.requiredSteps), `${c.id}：requiredSteps 要是陣列`)
    for (const s of c.requiredSteps) assert(CODES.includes(s), `${c.id}：「${s}」不是 steps 裡的代碼，只能用 ${CODES.join('、')}`)
    assert(typeof c.reason === 'string' && c.reason.trim().length >= 6, `${c.id}：reason 要寫一句話說明為什麼（至少 6 個字），之後 code review 的人才看得懂你的判斷`)
    assert.equal(c.safeForRollingUpdate, k.safe, `${c.id}：能不能直接滾動更新判斷錯了。提示：${k.hint}`)
    if (!k.safe) assert(c.requiredSteps.length > 0, `${c.id}：不能直接更新，就要寫出要多做哪些步驟`)
    else assert.deepEqual(c.requiredSteps, [], `${c.id}：可以直接滾動更新的變更，requiredSteps 填 []`)
    assert.deepEqual([...new Set(c.requiredSteps)].sort(), [...k.steps].sort(), `${c.id}：步驟不完整或多了不需要的。提示：${k.hint}`)
  }
})
