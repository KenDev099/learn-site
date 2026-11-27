import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type CallFrame = { functionName: string, url: string }
type Profile = { nodes: { id: number, callFrame: CallFrame }[], samples: number[], timeDeltas: number[], startTime: number, endTime: number }

test('answer.json 指向 slow-report.ts 的 CPU profile，hotFunction 是 self time 最高的具名函式', { timeout: 15_000 }, () => {
  let answer: { hotFunction?: unknown, profile?: unknown }
  try {
    answer = JSON.parse(readFileSync(join(import.meta.dirname, 'answer.json'), 'utf8'))
  } catch (err) {
    assert.fail(`answer.json 不是合法的 JSON：${(err as Error).message}`)
  }
  assert.ok(typeof answer.profile === 'string' && answer.profile.endsWith('.cpuprofile'),
    'answer.json 的 profile 要填 profile 檔的路徑（相對於 work/23），例如 "profiles/CPU.….cpuprofile"')
  assert.ok(typeof answer.hotFunction === 'string' && answer.hotFunction !== '', 'answer.json 的 hotFunction 要填函式名稱')
  const file = join(import.meta.dirname, answer.profile)
  assert.ok(existsSync(file), `找不到 ${answer.profile}：先在 work/23 執行 node --cpu-prof --cpu-prof-dir=profiles slow-report.ts，profile 檔要留在資料夾裡`)

  const profile: Profile = JSON.parse(readFileSync(file, 'utf8'))
  assert.ok(Array.isArray(profile.nodes) && Array.isArray(profile.samples) && Array.isArray(profile.timeDeltas), `${answer.profile} 不是 --cpu-prof 產生的 .cpuprofile`)
  const isTarget = (url: string) => url.startsWith('file:') && basename(fileURLToPath(url)) === 'slow-report.ts'
  assert.ok(profile.nodes.some(n => isTarget(n.callFrame.url)), `${answer.profile} 裡沒有 slow-report.ts 的函式：這個 profile 是別的程式產生的`)
  assert.ok(profile.samples.length >= 100, `${answer.profile} 只有 ${profile.samples.length} 個樣本，太少了：要讓 slow-report.ts 完整跑完`)

  // 自己算一次 self time：每個樣本記錄「當下正在執行哪個節點」，timeDeltas 是和前一個樣本相隔幾微秒
  const byId = new Map(profile.nodes.map(n => [n.id, n.callFrame]))
  const self = new Map<string, number>()
  profile.samples.forEach((id, i) => {
    const frame = byId.get(id)
    if (!frame || !frame.functionName || !isTarget(frame.url)) return
    self.set(frame.functionName, (self.get(frame.functionName) ?? 0) + (profile.timeDeltas[i] ?? 0))
  })
  const ranked = [...self].sort((a, b) => b[1] - a[1])
  assert.ok(ranked.length > 0, `${answer.profile} 裡沒有 slow-report.ts 的具名函式樣本`)
  const [top, topUs] = ranked[0]
  const ms = (us: number) => `${Math.round(us / 1000)}ms`
  const mine = self.get(answer.hotFunction)
  assert.equal(answer.hotFunction, top,
    mine === undefined
      ? `你的 profile 裡，slow-report.ts 沒有叫 ${answer.hotFunction} 的函式花掉 self time。打開 profile，用 Bottom-Up（依 Self Time 排序）找`
      : `${answer.hotFunction} 的 self time 只有 ${ms(mine)}，${top} 有 ${ms(topUs)}。total time 高的外層函式只是呼叫了別人；要找的是 self time（函式自己的程式碼）最高的那一個`)
})
