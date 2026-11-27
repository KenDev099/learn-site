import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
type Mod = { validateCouponCode?: unknown, parseDrinkNote?: unknown }

// 原本的規則：拿來比對語意（只用很短的字串，原本的規則也跑得完）
const COUPON = /^([A-Z0-9]+-?)*[A-Z0-9]+$/
const NOTE = /^([\p{L}\p{N}]+ ?)*[\p{L}\p{N}]+(\s*,\s*([\p{L}\p{N}]+ ?)*[\p{L}\p{N}]+)*$/u

async function load() {
  const mod: Mod = await import('./validators.ts')
  assert.equal(typeof mod.validateCouponCode, 'function', 'validators.ts 要 export validateCouponCode')
  assert.equal(typeof mod.parseDrinkNote, 'function', 'validators.ts 要 export parseDrinkNote')
  return { coupon: mod.validateCouponCode as (s: string) => boolean, note: mod.parseDrinkNote as (s: string) => string[] | null }
}
function randomStrings(alphabet: string[], count: number) {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let s = ''
    const len = Math.floor(Math.random() * 10)
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
    out.push(s)
  }
  return out
}

test('validateCouponCode 的語意不變：哪些合法、哪些不合法都和原本一樣', opts, async () => {
  const { coupon } = await load()
  const fixed = ['LATTE', 'LATTE-2026', 'A-B-C', '9', '-LATTE', 'LATTE-', 'LATTE--2026', 'latte', 'LATTE 2026', '', 'Ａ']
  for (const s of [...fixed, ...randomStrings(['A', 'Z', '0', '9', '-', '-', 'a', '!', ' '], 3000)]) {
    assert.equal(coupon(s), COUPON.test(s), `validateCouponCode(${JSON.stringify(s)}) 要是 ${COUPON.test(s)}：改寫後語意不能變`)
  }
})

test('parseDrinkNote 的語意不變：合法時回傳去掉空白的選項，不合法回傳 null', opts, async () => {
  const { note } = await load()
  const fixed = ['少冰', '少冰,半糖', '少冰 , 半糖, extra shot', '少冰\t,半糖', '少冰,', ' 少冰', '少冰 ', '少冰  半糖', '少冰!', ',', '', '2 shots']
  for (const s of [...fixed, ...randomStrings(['少', 'a', '1', ' ', ' ', ',', '\t', '!', '-'], 3000)]) {
    const expected = NOTE.test(s) ? s.split(',').map(x => x.trim()) : null
    assert.deepEqual(note(s), expected, `parseDrinkNote(${JSON.stringify(s)}) 要是 ${JSON.stringify(expected)}：改寫後語意不能變`)
  }
})

test('惡意輸入（29 到 5,000 多個字元）每次呼叫都在 50ms 內回傳，很長的合法輸入照樣接受', opts, async () => {
  await load()
  const attacks = {
    // 前兩個只有 29 個字元：先限制長度（例如 32）擋不住，原本的規則光這一個就要好幾秒
    coupon: ['A'.repeat(28) + '!', '9'.repeat(28) + '!', 'A'.repeat(5000) + '!', 'AB-'.repeat(1666) + '!', 'A'.repeat(2500) + '-'.repeat(2500), '9'.repeat(4999) + '-'],
    note: ['少'.repeat(28) + '!', 'ab'.repeat(14) + '!', '少'.repeat(5000) + '!', 'ab '.repeat(1666) + '!', '少,' + '少'.repeat(5000) + '!', '少, '.repeat(1666) + '!', '少' + ' '.repeat(4998) + '!', '少 ,' + ' '.repeat(5000) + '!'],
  }
  const long = {
    coupon: ['A'.repeat(5000), 'AB-'.repeat(1666) + 'C', 'LATTE-2026-' + '9'.repeat(100)],
    note: ['少'.repeat(5000), '少冰 '.repeat(1000) + '半糖', '少冰, '.repeat(800) + 'extra shot'],
  }
  // 在子程序裡量：卡住的是子程序，2 秒後砍掉，測試本身不會卡
  const dir = await tmpDir()
  const script = join(dir, 'measure.mjs')
  await writeFile(script, `
    const m = await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'validators.ts')).href)})
    const attacks = ${JSON.stringify(attacks)}
    const long = ${JSON.stringify(long)}
    m.validateCouponCode('LATTE'); m.parseDrinkNote('少冰')   // 先熱身
    const slow = []
    for (const [fn, inputs] of [['validateCouponCode', attacks.coupon], ['parseDrinkNote', attacks.note]]) {
      for (const s of inputs) {
        console.error(fn, JSON.stringify(s.slice(0, 12) + '…'))
        const t = performance.now(); m[fn](s); const ms = performance.now() - t
        if (ms > 50) slow.push(fn + '(' + JSON.stringify(s.slice(0, 12)) + '…) 花了 ' + Math.round(ms) + 'ms')
      }
    }
    // 很長但合法的輸入：語意不能變（不能用「太長就不合法」來躲）
    const wrong = []
    for (const s of long.coupon) if (m.validateCouponCode(s) !== true) wrong.push('validateCouponCode(' + s.length + ' 個字元的合法優惠碼 ' + JSON.stringify(s.slice(0, 12)) + '…) 要是 true')
    for (const s of long.note) {
      const got = m.parseDrinkNote(s), want = s.split(',').map(x => x.trim())
      if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push('parseDrinkNote(' + s.length + ' 個字元的合法備註 ' + JSON.stringify(s.slice(0, 12)) + '…) 要回傳 ' + want.length + ' 個選項')
    }
    console.log(JSON.stringify({ slow, wrong }))
  `)
  let r
  try {
    r = await runNode(script, { timeoutMs: 2_000 })
  } catch {
    assert.fail('2 秒內沒有跑完：還有會指數回溯的規則（巢狀量詞，例如 (X+ ?)*X+ 或 (X+)+）。只加長度上限沒用，29 個字元就夠卡死')
  }
  assert.equal(r.code, 0, `量測的程式出錯了：${r.stderr.slice(-500)}`)
  const { slow, wrong }: { slow: string[], wrong: string[] } = JSON.parse(r.stdout)
  assert.deepEqual(slow, [], `太慢了：${slow.join('；')}。只加長度上限不夠：29 個字元就能卡住原本的規則，而且合法的長字串也不能被擋掉`)
  assert.deepEqual(wrong, [], `語意變了：${wrong.join('；')}。不能用長度上限把合法的長字串當成不合法`)
})
