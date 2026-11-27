// 練習 3：state 裡有什麼，以及用 OpenTofu 的 state 加密保護它
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, requireDocker } from '../../helpers/docker.ts'
import { API_IMAGE, cleanup, ensureImages, tail, tofuRunner } from './tofu.ts'

const dir = import.meta.dirname
const password = randomBytes(12).toString('hex')
const passphrase = randomBytes(12).toString('hex')   // 24 個字元
const env = { TF_VAR_db_password: password, TF_VAR_api_image: API_IMAGE, TF_VAR_state_passphrase: passphrase }
let runner: ReturnType<typeof tofuRunner> | undefined
const tf = (args: string[], extra: Record<string, string> = {}, sub = '') => runner!.tofu([...args, '-no-color'], { ...env, ...extra }, sub)
const files = ['terraform.tfstate', 'terraform.tfstate.backup', 'ex3.plan']
const resetState = () => { for (const f of files) rmSync(join(dir, f), { force: true }) }
const fresh = join(dir, '.check-enforced')
let applyError = 'apply 沒有執行'

before(() => {
  requireDocker()
  ensureImages(dir)
  cleanup('ld-20-')
  resetState()
  runner = tofuRunner(dir, 'ex3')
  const init = tf(['init', '-input=false'])
  if (init.code !== 0) { applyError = `tofu init 失敗：\n${tail(init)}`; return }
  const apply = tf(['apply', '-auto-approve', '-input=false'])
  applyError = apply.code === 0 ? '' : `tofu apply 失敗（先讓練習 1 通過）：\n${tail(apply)}`
})
after(() => {
  if (!applyError) tf(['destroy', '-auto-approve', '-input=false'])
  runner?.stop()
  cleanup('ld-20-')
  resetState()
  rmSync(fresh, { recursive: true, force: true })
})

test('answers.json：密碼出現在 state 裡哪些資源的哪個屬性', () => {
  assert.equal(applyError, '', applyError)
  const show = tf(['show', '-json'])
  assert.equal(show.code, 0, `tofu show -json 失敗：\n${tail(show)}`)
  const resources = JSON.parse(show.stdout).values?.root_module?.resources ?? []
  const hits = resources.flatMap((r: any) => Object.entries(r.values ?? {})
    .filter(([, v]) => JSON.stringify(v).includes(password)).map(([k]) => ({ address: r.address, attribute: k })))
  const ans = readJson(dir, 'answers.json')
  const want = [...new Set(hits.map((h: any) => h.address))].sort()
  const got = (Array.isArray(ans.addresses) ? ans.addresses.map(String) : []).sort()
  assert.deepEqual(got, want, `addresses 要列出 state 裡含有密碼的所有資源。sensitive 只遮住畫面上的輸出，state 照樣存明文；而且密碼會跟著引用擴散：用到 var.db_password 的資源都會存一份`)
  const attrs = [...new Set(hits.map((h: any) => h.attribute))]
  assert.ok(attrs.includes(ans.attribute), `attribute 應該是 ${attrs.join(' 或 ')}（resources[].instances[].attributes 底下的屬性名稱），你寫的是「${ans.attribute}」`)
})

test('state 檔是加密的：沒有密碼明文，帶有加密的中繼資料', () => {
  assert.equal(applyError, '', applyError)
  const raw = readFileSync(join(dir, 'terraform.tfstate'), 'utf8')
  const state = JSON.parse(raw)
  assert.ok(state.encrypted_data && state.meta, 'terraform.tfstate 沒有加密（沒有 encrypted_data 與 meta）：在 encryption.tf 的 terraform { encryption { … state { method = … } } } 設定加密。只把密碼從 state 刪掉沒有用，下次 apply 又會寫回去')
  assert.ok(!raw.includes(password), 'terraform.tfstate 裡還找得到密碼明文')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.tf')))
    assert.ok(!readFileSync(join(dir, f), 'utf8').includes(passphrase), `${f} 裡出現了 passphrase`)
})

test('plan 檔也是加密的', () => {
  assert.equal(applyError, '', applyError)
  const plan = tf(['plan', '-out=ex3.plan', '-input=false'])
  assert.equal(plan.code, 0, `tofu plan -out 失敗：\n${tail(plan)}`)
  const buf = readFileSync(join(dir, 'ex3.plan'))
  assert.notEqual(buf.subarray(0, 2).toString(), 'PK', 'ex3.plan 是沒加密的 zip：plan 檔裡也有密碼（和整份設定），encryption 裡要有 plan { method = … }')
  assert.ok(!buf.includes(password), 'plan 檔裡找得到密碼明文')
})

test('passphrase 來自變數：換一個 passphrase 就解不開', () => {
  assert.equal(applyError, '', applyError)
  const r = tf(['plan', '-input=false', '-lock=false'], { TF_VAR_state_passphrase: randomBytes(12).toString('hex') })
  assert.notEqual(r.code, 0, '用別的 TF_VAR_state_passphrase 也能讀 state：passphrase 要寫成 var.state_passphrase，不能寫死在 .tf 檔裡')
  assert.match(r.stderr + r.stdout, /decrypt/i, `應該是解密失敗，實際錯誤：\n${tail(r)}`)
})

test('enforced：state 與 plan 都拒絕改成不加密', () => {
  assert.equal(applyError, '', applyError)
  rmSync(fresh, { recursive: true, force: true })
  mkdirSync(fresh)
  for (const f of readdirSync(dir).filter(f => f.endsWith('.tf') || f === '.terraform.lock.hcl')) copyFileSync(join(dir, f), join(fresh, f))
  cpSync(join(dir, '.terraform'), join(fresh, '.terraform'), { recursive: true, verbatimSymlinks: true })   // 沿用已下載的 provider，不必再 init
  for (const block of ['state', 'plan']) {
    // TF_ENCRYPTION 的設定會覆蓋程式碼裡的設定：模擬有人想把加密關掉
    const off = `method "unencrypted" "off" {}\n${block} {\n  method = method.unencrypted.off\n}\n`
    const r = tf(['plan', '-input=false', '-refresh=false'], { TF_ENCRYPTION: off }, '.check-enforced')
    assert.notEqual(r.code, 0, `把 ${block} 改成 unencrypted 還是能執行：在 ${block} 區塊加 enforced = true，拒絕寫入沒加密的資料`)
    assert.match(r.stderr + r.stdout, /enforced/, `應該是因為 enforced 而失敗，實際錯誤：\n${tail(r)}`)
  }
})
