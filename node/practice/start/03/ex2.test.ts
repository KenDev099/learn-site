import test from 'node:test'
import assert from 'node:assert/strict'

const opts = { timeout: 15_000 }
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

type Fns = { satisfies: (v: string, r: string) => boolean, maxSatisfying: (vs: string[], r: string) => string | null }
async function load(): Promise<Fns> {
  const mod: { satisfies?: unknown, maxSatisfying?: unknown } = await import('./semver.ts')
  assert.equal(typeof mod.satisfies, 'function', 'semver.ts 要 export function satisfies(version, range)')
  assert.equal(typeof mod.maxSatisfying, 'function', 'semver.ts 要 export function maxSatisfying(versions, range)')
  return mod as Fns
}

// 預期結果由 npm 11.19.1 內建的 semver 7.8.5 產生：[版本, 範圍, 符不符合]
const cases: [string, string, boolean][] = [
  ['1.2.3', '1.2.3', true],
  ['1.2.4', '1.2.3', false],
  ['1.2.3-rc.1', '1.2.3', false],
  ['1.2.3', '^1.2.3', true],
  ['1.2.2', '^1.2.3', false],
  ['1.2.4', '^1.2.3', true],
  ['1.9.0', '^1.2.3', true],
  ['1.10.0', '^1.2.3', true],
  ['2.0.0', '^1.2.3', false],
  ['1.3.0-beta.1', '^1.2.3', false],
  ['2.0.0-rc.1', '^1.2.3', false],
  ['1.2.3', '~1.2.3', true],
  ['1.2.9', '~1.2.3', true],
  ['1.2.10', '~1.2.3', true],
  ['1.3.0', '~1.2.3', false],
  ['1.2.2', '~1.2.3', false],
  ['0.2.3', '^0.2.3', true],
  ['0.2.9', '^0.2.3', true],
  ['0.2.10', '^0.2.3', true],
  ['0.3.0', '^0.2.3', false],
  ['0.2.2', '^0.2.3', false],
  ['1.0.0', '^0.2.3', false],
  ['0.0.3', '^0.0.3', true],
  ['0.0.4', '^0.0.3', false],
  ['0.0.2', '^0.0.3', false],
  ['0.1.0', '^0.0.3', false],
  ['0.2.5', '~0.2.3', true],
  ['0.3.0', '~0.2.3', false],
  ['1.10.0', '^1.9.0', true],
  ['1.8.9', '^1.9.0', false],
  ['9.9.9', '^10.1.0', false],
  ['10.1.0', '^10.1.0', true],
  ['10.20.3', '^10.1.0', true],
  ['11.0.0', '^10.1.0', false],
  ['1.3.0-beta.1', '^1.3.0-beta.1', true],
  ['1.3.0-beta.2', '^1.3.0-beta.1', true],
  ['1.3.0-beta.10', '^1.3.0-beta.1', true],
  ['1.3.0-beta.0', '^1.3.0-beta.1', false],
  ['1.3.0-alpha.5', '^1.3.0-beta.1', false],
  ['1.3.0', '^1.3.0-beta.1', true],
  ['1.4.0', '^1.3.0-beta.1', true],
  ['1.3.1-beta.1', '^1.3.0-beta.1', false],
  ['2.0.0', '^1.3.0-beta.1', false],
  ['2.0.0-rc.2', '~2.0.0-rc.1', true],
  ['2.0.0', '~2.0.0-rc.1', true],
  ['2.0.1-rc.1', '~2.0.0-rc.1', false],
  ['2.0.0-rc.0', '~2.0.0-rc.1', false],
  ['2.0.0-rc.1', '2.0.0-rc.1', true],
  ['2.0.0', '2.0.0-rc.1', false],
  ['1.3.0-1', '^1.3.0-beta.1', false],
  ['1.3.0-beta', '^1.3.0-beta.1', false],
  ['1.3.0-beta.1.1', '^1.3.0-beta.1', true],
  ['1.3.0-rc', '^1.3.0-beta.1', true],
  ['1.3.0-beta.1', '^1.3.0-1', true],
  ['1.3.0-beta.x', '^1.3.0-beta.9', true],
  ['0.0.3-rc.2', '^0.0.3-rc.1', true],
  ['0.0.4-rc.1', '^0.0.3-rc.1', false],
  ['0.0.9', '~0.0.3', true],
  ['0.1.0', '~0.0.3', false],
]
const maxCases: [string[], string, string | null][] = [
  [['1.2.3', '1.4.0', '1.9.0', '2.0.0', '2.1.0-rc.1'], '^1.2.3', '1.9.0'],
  [['1.9.0', '1.10.0', '1.2.0'], '^1.0.0', '1.10.0'],
  [['0.2.3', '0.2.10', '0.3.0', '0.2.9'], '^0.2.0', '0.2.10'],
  [['1.3.0-beta.2', '1.3.0-beta.10', '1.2.9', '1.4.0-beta.1'], '^1.3.0-beta.1', '1.3.0-beta.10'],
  [['1.2.3', '1.2.10', '1.3.0'], '~1.2.0', '1.2.10'],
  [['3.0.0', '0.9.0'], '^1.0.0', null],
  [['1.0.0-alpha', '1.0.0-1', '1.0.0-alpha.1', '1.0.0-0'], '^1.0.0-0', '1.0.0-alpha.1'],
  [['1.0.0-beta.2', '1.0.0-beta', '1.0.0-beta.1.5'], '~1.0.0-beta', '1.0.0-beta.2'],
]

function check(fns: Fns, pick: (range: string, version: string) => boolean) {
  for (const [v, range, want] of cases.filter(([v, r]) => pick(r, v))) {
    assert.equal(fns.satisfies(v, range), want, `satisfies('${v}', '${range}') 要是 ${want}`)
  }
}
const pre = (s: string) => s.includes('-')

test('精確版本：只有完全一樣才符合', opts, async () => {
  check(await load(), r => /^\d/.test(r))
})

test('^ 不跨 major，版本號要逐段用數字比（1.10.0 > 1.9.0）', opts, async () => {
  const fns = await load()
  check(fns, (r, v) => r.startsWith('^') && !r.startsWith('^0.') && !pre(r) && !pre(v))
  for (let i = 0; i < 20; i++) {
    const a = rand(1, 30), b = rand(0, 30), c = rand(0, 30)
    assert.equal(fns.satisfies(`${a}.${b + rand(1, 20)}.${c}`, `^${a}.${b}.${c}`), true, `${a}.${b}.${c} 之後同一個 major 的新 minor 要符合 ^${a}.${b}.${c}`)
    assert.equal(fns.satisfies(`${a + 1}.0.0`, `^${a}.${b}.${c}`), false, `${a + 1}.0.0 跨了 major，不符合 ^${a}.${b}.${c}`)
    assert.equal(fns.satisfies(`${a}.${b}.${c + rand(1, 20)}`, `~${a}.${b}.${c}`), true, `${a}.${b}.${c} 之後同一個 minor 的新 patch 要符合 ~${a}.${b}.${c}`)
    assert.equal(fns.satisfies(`${a}.${b + 1}.0`, `~${a}.${b}.${c}`), false, `${a}.${b + 1}.0 換了 minor，不符合 ~${a}.${b}.${c}`)
  }
})

test('~ 只接受同一個 minor 的新 patch', opts, async () => {
  check(await load(), (r, v) => r.startsWith('~') && !pre(r) && !pre(v))
})

test('0.x：^0.2.3 不接受 0.3.0，^0.0.3 只接受 0.0.3', opts, async () => {
  const fns = await load()
  check(fns, (r, v) => r.startsWith('^0.') && !pre(v))
  for (let i = 0; i < 20; i++) {
    const b = rand(1, 30), c = rand(0, 30)
    assert.equal(fns.satisfies(`0.${b}.${c + rand(1, 20)}`, `^0.${b}.${c}`), true, `0.${b}.${c} 之後同一個 minor 的新 patch 要符合 ^0.${b}.${c}`)
    assert.equal(fns.satisfies(`0.${b + 1}.0`, `^0.${b}.${c}`), false, `0.x 時 minor 就是 major：0.${b + 1}.0 不符合 ^0.${b}.${c}`)
    assert.equal(fns.satisfies(`0.0.${c + 1}`, `^0.0.${c}`), false, `^0.0.${c} 只接受 0.0.${c}`)
  }
})

test('prerelease 只有在範圍寫了同一個 major.minor.patch 的 prerelease 時才會被選到', opts, async () => {
  const fns = await load()
  check(fns, (r, v) => pre(r) || pre(v))
  for (let i = 0; i < 20; i++) {
    const a = rand(1, 30), b = rand(0, 30), c = rand(0, 30), n = rand(0, 15), k = rand(1, 15)
    const core = `${a}.${b}.${c}`
    assert.equal(fns.satisfies(`${core}-rc.${n + k}`, `^${core}-rc.${n}`), true, `${core}-rc.${n + k} 比 ${core}-rc.${n} 新（prerelease 的數字段要用數字比），要符合 ^${core}-rc.${n}`)
    assert.equal(fns.satisfies(`${core}-rc.${n}`, `^${core}-rc.${n + k}`), false, `${core}-rc.${n} 比 ${core}-rc.${n + k} 舊，不符合 ^${core}-rc.${n + k}`)
    assert.equal(fns.satisfies(`${a}.${b}.${c + 1}-rc.${n + k}`, `^${core}-rc.${n}`), false, `${a}.${b}.${c + 1}-rc.${n + k} 的 major.minor.patch 跟範圍不同，prerelease 不會被選到`)
    assert.equal(fns.satisfies(`${a}.${b + 1}.0-rc.${n}`, `^${core}`), false, `^${core} 沒寫 prerelease，不接受 ${a}.${b + 1}.0-rc.${n}`)
    assert.equal(fns.satisfies(core, `^${core}-rc.${n}`), true, `正式版 ${core} 比 ${core}-rc.${n} 大，要符合 ^${core}-rc.${n}`)
  }
})

test('maxSatisfying 回傳符合範圍的最高版本，沒有就回傳 null', opts, async () => {
  const fns = await load()
  for (const [list, range, want] of maxCases) {
    const shuffled = [...list].sort(() => Math.random() - 0.5)
    assert.equal(fns.maxSatisfying(shuffled, range), want, `maxSatisfying(${JSON.stringify(shuffled)}, '${range}') 要是 ${JSON.stringify(want)}`)
  }
})
