import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runNodeTests } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

const opts = { timeout: 30_000 }
const correct = await readFile(join(import.meta.dirname, 'notify.ts'), 'utf8')

function mutate(from: string, to: string) {
  assert.ok(correct.includes(from), `notify.ts 被改過了，找不到「${from.trim()}」：刪掉 work/22/notify.ts 再跑一次 check.mjs 就會補回來`)
  return correct.replace(from, to)
}
const mutants: [string, () => string, string][] = [
  ['每 3 秒就查一次（間隔寫錯）', () => mutate('setTimeout(resolve, INTERVAL_MS)', 'setTimeout(resolve, INTERVAL_MS / 10)'),
    '假時鐘走 30 秒之後，用 getStatus.mock.callCount() 檢查剛好查了 2 次'],
  ['ready 之後沒有停，每一輪都再傳一次簡訊', () => mutate('        await deps.sendSms(orderId)\n        return true\n', '        await deps.sendSms(orderId)\n'),
    'ready 之後再讓時間走幾分鐘，檢查 sendSms.mock.callCount() 剛好是 1'],
  ['10 分鐘沒有放棄（要 1 小時才放棄）', () => mutate('Date.now() - start >= GIVE_UP_MS', 'Date.now() - start >= GIVE_UP_MS * 6'),
    '一直 pending 時，走滿 10 分鐘要回傳 false、log.warn 被呼叫一次'],
  ['getStatus 丟錯就整個停下來', () => mutate('    } catch {\n', '    } finally {\n'),
    '用 mockImplementationOnce 讓第一次 getStatus 丟錯，檢查下一輪還會查、ready 時還會通知'],
]

async function runSpec(impl: string) {
  const spec = await readFile(join(import.meta.dirname, 'notify.spec.ts'), 'utf8')
  const dir = await tmpProject({ 'notify.spec.ts': spec, 'notify.ts': impl })
  return runNodeTests(join(dir, 'notify.spec.ts'), { cwd: dir, timeoutMs: 20_000 })
}
// 每個測試自己花的時間加總（TAP 裡頂層測試的 duration_ms），不含啟動 node 的時間，機器忙的時候也準
const testMs = (stdout: string) => [...stdout.matchAll(/^  duration_ms: ([\d.]+)$/gm)].reduce((s, m) => s + Number(m[1]), 0)
const failures = (stdout: string) => stdout.split('\n').filter(l => /^not ok|^\s+(error|expected|actual):/.test(l)).slice(0, 12).join('\n')

test('配上正確的 notify.ts：至少 4 個測試，全部通過，整個檔案 3 秒內跑完', opts, async () => {
  let r
  try {
    r = await runSpec(correct)
  } catch {
    assert.fail('notify.spec.ts 20 秒內沒有跑完：是不是真的在等 30 秒？用 t.mock.timers.enable({ apis: [\'setTimeout\', \'Date\'] }) 加上 advance() 讓假時鐘往前走')
  }
  assert.equal(r.fail, 0, `正確的程式也有測試沒過，是測試的預期寫錯了：\n${failures(r.stdout)}`)
  assert.equal(r.code, 0, `node --test notify.spec.ts 沒有成功結束：\n${r.stderr.slice(0, 600)}`)
  assert.ok(r.pass >= 4, `至少要有 4 個測試（間隔、只通知一次、10 分鐘放棄、丟錯繼續），現在只有 ${r.pass} 個`)
  const ms = testMs(r.stdout)
  assert.ok(ms < 3000, `測試一共花了 ${Math.round(ms)}ms，要在 3 秒內：不要真的等，用假時鐘`)
})

for (const [label, make, hint] of mutants) {
  test(`抓得到這個 bug：${label}`, opts, async () => {
    let r
    try {
      r = await runSpec(make())
    } catch {
      return   // 卡住跑不完也算抓到（測試沒有通過）
    }
    assert.ok(r.fail > 0 || r.code !== 0, `把 notify.ts 改成「${label}」之後，你的測試還是全部通過。提示：${hint}`)
  })
}
