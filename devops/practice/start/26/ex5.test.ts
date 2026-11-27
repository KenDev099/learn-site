// 練習 5：RUNBOOK.md 與 DECISIONS.md。文件要跟 repo 裡的腳本對得上，決策要寫出代價
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = import.meta.dirname
const read = (file: string) => {
  assert.ok(existsSync(join(dir, file)), `找不到 ${file}`)
  return readFileSync(join(dir, file), 'utf8')
}
// 用 ## 切成章節：{ 標題: 內容 }
function sections(md: string, level = '##') {
  const out: { title: string, body: string }[] = []
  for (const part of md.split(new RegExp(`^${level} `, 'm')).slice(1)) {
    const nl = part.indexOf('\n')
    out.push({ title: part.slice(0, nl < 0 ? undefined : nl).trim(), body: nl < 0 ? '' : part.slice(nl + 1) })
  }
  return out
}
const blocks = (body: string) => [...body.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(m => m[1])
// 程式碼區塊裡提到的 repo 內檔案（相對路徑；/etc/…、$HOME/… 這類機器上的路徑不算）
// 沒有路徑的 .timer、.service 是 systemd 的 unit 名稱（systemctl status cafe-backup.timer），不是檔案
const refs = (code: string) => [...code.matchAll(/(?<=^|[\s"'=(])((?:\.\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:sh|ya?ml|timer|service|conf))(?![\w/])/gm)]
  .map(m => m[1]).filter(f => f.includes('/') || /\.(sh|ya?ml)$/.test(f))

const REQUIRED = ['部署', '回滾', '還原', '輪替資料庫密碼', '收到燃燒率告警', '備份排程']
function runbook() {
  const all = sections(read('RUNBOOK.md'))
  return Object.fromEntries(REQUIRED.map(name => {
    const s = all.find(x => x.title.includes(name))
    assert.ok(s, `RUNBOOK.md 少了「## ${name}」這一章`)
    const code = blocks(s.body)
    assert.ok(code.length, `「${name}」這一章沒有程式碼區塊：值班的人要能直接複製指令，不是讀一段描述自己想`)
    return [name, { body: s.body, code: code.join('\n') }]
  })) as Record<string, { body: string, code: string }>
}

test('RUNBOOK.md 有六章，每一章都有可以直接執行的指令', () => {
  runbook()
})

test('RUNBOOK.md 指令裡提到的腳本與設定檔都存在', () => {
  const missing = new Set<string>()
  for (const { code } of Object.values(runbook())) for (const f of refs(code)) if (!existsSync(join(dir, f))) missing.add(f)
  assert.deepEqual([...missing], [], `RUNBOOK.md 提到的這些檔案不存在：${[...missing].join('、')}。文件跟腳本對不上，事故時照著做會失敗`)
})

test('回滾用 rollback.sh，還原真的把備份還原回資料庫', () => {
  const rb = runbook()
  assert.match(rb['回滾'].code, /rollback\.sh/, '「回滾」要執行 rollback.sh：值班的人照著做，幾秒內切回上一版')
  assert.match(rb['還原'].code, /pg_restore/, '「還原」要有把備份還原回正式資料庫的指令（pg_restore …）：還原演練只證明備份是好的，資料還沒回來')
})

test('輪替資料庫密碼：換掉密碼檔、ALTER ROLE、讓 api 用新密碼重新連線', () => {
  const { code } = runbook()['輪替資料庫密碼']
  assert.match(code, /secrets\/app_password\.txt/, '要更新 secrets/app_password.txt（api 從這個檔讀密碼）')
  assert.match(code, /ALTER\s+(ROLE|USER)\s+cafe_app\b[\s\S]*PASSWORD/i, '要在資料庫裡改密碼：ALTER ROLE cafe_app … PASSWORD …')
  assert.match(code, /deploy\.sh|--force-recreate/, 'api 只在啟動時讀密碼：改完要用 deploy.sh（或重新建立容器）讓 api 換上新密碼')
})

// 備份排程的間隔（分鐘）：cron 的分鐘欄位，或 systemd timer 的 OnCalendar／OnUnitActiveSec
function interval(text: string): number | null {
  const f = '[\\d*,/-]+', g = '[\\w*,/-]+'
  const cron = new RegExp(`^\\s*(${f})\\s+(${f})\\s+${f}\\s+${g}\\s+${g}\\s+.*backup\\.sh`, 'm').exec(text)
  if (cron) {
    const [, min, hour] = cron
    if (hour !== '*') return 24 * 60
    if (min === '*') return 1
    const step = /^\*\/(\d+)$/.exec(min)
    if (step) return Number(step[1])
    const list = min.split(',').map(Number).sort((a, b) => a - b)
    if (list.some(Number.isNaN)) return null
    return Math.max(...list.map((m, i) => (list[i + 1] ?? list[0] + 60) - m))
  }
  const cal = /^\s*OnCalendar\s*=\s*(.+)$/m.exec(text)?.[1].trim()
  if (cal) {
    const keyword: Record<string, number> = { minutely: 1, hourly: 60, daily: 1440, weekly: 10080 }
    if (cal in keyword) return keyword[cal]
    const m = /(?:^|\s)\*:0*\d*\/(\d+)(?::00)?$/.exec(cal)
    return m ? Number(m[1]) : null
  }
  const sec = /^\s*OnUnitActiveSec\s*=\s*(\d+)\s*(min|m|s|h)?\s*$/m.exec(text)
  if (sec) return Number(sec[1]) * ({ s: 1 / 60, m: 1, min: 1, h: 60 }[sec[2] ?? 's'] ?? 1)
  return null
}

test('備份排程：附上 cron 或 systemd timer 的設定，執行 ops/backup.sh，間隔不超過 15 分鐘（RPO）', () => {
  const { body } = runbook()['備份排程']
  // 一起看章節裡提到的 .timer、.service 檔
  const files = refs(body).filter(f => /\.(timer|service)$/.test(f) && existsSync(join(dir, f))).map(f => readFileSync(join(dir, f), 'utf8'))
  const text = [body, ...files].join('\n')
  assert.match(text, /ops\/backup\.sh/, '排程要執行 ops/backup.sh')
  const minutes = interval(text)
  assert.ok(minutes !== null, '看不出排程的間隔：用 cron（例如 */15 * * * * …ops/backup.sh）或 systemd timer（OnCalendar=*:0/15），寫在這一章或它提到的 .timer 檔裡')
  assert.ok(minutes <= 15, `排程間隔是 ${minutes} 分鐘：NEEDS.md 說資料遺失不能超過 15 分鐘（RPO），兩次備份之間最多就是 15 分鐘`)
})

test('DECISIONS.md 至少 3 個 ADR，每個都有背景、決策、後果，後果寫出缺點與重新評估的時機', () => {
  const adrs = sections(read('DECISIONS.md'))
  assert.ok(adrs.length >= 3, `DECISIONS.md 只有 ${adrs.length} 個「## 」章節（ADR），至少要 3 個`)
  const decided = adrs.map(a => sections(a.body, '###').find(p => p.title.includes('決策'))?.body.replace(/\s+/g, '') ?? '')
  const dup = decided.findIndex((d, i) => d && decided.indexOf(d) !== i)
  assert.equal(dup, -1, `「${adrs[dup]?.title}」的決策跟前面的 ADR 一模一樣：每個 ADR 記錄一個不同的決策（例如藍綠 vs 滾動、pg_dump vs PITR、購物車放哪裡）`)
  for (const adr of adrs) {
    const parts = sections(adr.body, '###')
    for (const name of ['背景', '決策', '後果'])
      assert.ok(parts.some(p => p.title.includes(name) && p.body.trim().length >= 10), `「${adr.title}」少了「### ${name}」，或內容太短`)
    const result = parts.find(p => p.title.includes('後果'))!.body
    assert.match(result, /(缺點|代價)[：:]\s*\S{6,}/, `「${adr.title}」的後果沒有寫缺點（用「缺點：…」或「代價：…」開頭）：每個決策都有代價，沒寫出來，之後的人不知道它在什麼時候會出問題`)
    assert.match(adr.body, /重新評估/, `「${adr.title}」沒寫什麼時候要重新評估：情況變了（流量、團隊、SLO），決策也要跟著檢查`)
  }
})
