// 練習 1：lockfile 與型別錯誤修好，npm run ci 的 deps、typecheck 兩步通過；不靠改 CI、放寬型別或契約
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const START = join(dir, '../../start/06')
const read = (root: string, file: string) => existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : ''
const pkg = (root: string) => JSON.parse(read(root, 'package.json') || '{}')
const files = (root: string, sub: string): string[] => !existsSync(join(root, sub)) ? [] : readdirSync(join(root, sub)).flatMap(name => {
  const p = join(root, sub, name)
  return statSync(p).isDirectory() ? files(root, relative(root, p)) : [relative(root, p)]
})
const COMPONENT = 'web/src/components/PickupTime.vue'

type Step = { name: string, ok: boolean, output: string }
let steps: Step[] = []
let output = ''

beforeAll(() => {
  rmSync(join(dir, 'ci-report.json'), { force: true })
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
  const r = spawnSync(process.execPath, ['ci.mjs'], { cwd: dir, env, encoding: 'utf8', timeout: 240_000 })
  output = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-2000)
  if (existsSync(join(dir, 'ci-report.json'))) steps = JSON.parse(read(dir, 'ci-report.json')).steps ?? []
}, 260_000)

const step = (name: string) => steps.find(s => s.name === name)

describe('練習 1：CI 的 deps 與 typecheck', () => {
  it('不改 CI、tsconfig 與共用契約', () => {
    for (const file of ['ci.mjs', 'api/tsconfig.json', 'web/tsconfig.json']) {
      expect(read(dir, file) === read(START, file), `${file} 要跟題目一樣：CI 紅了要修程式，不是改檢查（還原：從 start/06 複製回來）`).toBe(true)
    }
    expect(read(dir, 'shared/contract.ts') === read(START, 'shared/contract.ts'),
      'shared/contract.ts 不能改：契約描述的是 JSON，JSON 裡的時間就是字串。要改的是把它當成 Date 的元件').toBe(true)
  })

  it('前台只改 PickupTime.vue，其他檔案跟題目一樣', () => {
    const mine = files(dir, 'web/src').filter(f => f !== COMPONENT).sort()
    expect(mine, 'web/src 底下不要新增或刪除檔案（例如另外宣告型別蓋掉錯誤）；只改 PickupTime.vue').toEqual(files(START, 'web/src').filter(f => f !== COMPONENT).sort())
    for (const file of mine) {
      expect(read(dir, file) === read(START, file), `${file} 要跟題目一樣（從 start/06 複製回來）：錯的是 PickupTime.vue 宣告的 prop 型別，訂單頁、API 函式傳的都是契約的字串`).toBe(true)
    }
  })

  it('deps：package.json 的版本跟 lockfile 一致', () => {
    expect(step('deps'), `ci.mjs 沒有跑完（沒有 ci-report.json）：\n${output}`).toBeDefined()
    expect(Object.keys({ ...pkg(dir).dependencies, ...pkg(dir).devDependencies }).sort(), '不要刪掉 package.json 裡的套件').toEqual(Object.keys({ ...pkg(START).dependencies, ...pkg(START).devDependencies }).sort())
    expect(step('deps')!.ok, `deps 沒過：\n${step('deps')!.output}`).toBe(true)
  })

  it('typecheck：tsc 與 vue-tsc 都沒有錯誤', () => {
    expect(step('typecheck'), `ci.mjs 沒有跑完（沒有 ci-report.json）：\n${output}`).toBeDefined()
    expect(step('typecheck')!.ok, `typecheck 沒過：\n${step('typecheck')!.output}`).toBe(true)
  })

  it('沒有用 any、型別斷言或 @ts- 註解蓋掉錯誤，取餐時間還在訂單頁上', () => {
    for (const file of ['web/src/components/PickupTime.vue', 'web/src/pages/OrderStatusPage.vue']) {
      const code = read(dir, file)
      expect(code, `找不到 ${file}`).not.toBe('')
      expect(code, `${file} 不能用 any、as unknown 或 @ts-ignore 這類寫法讓型別檢查閉嘴；讓型別跟真正收到的資料一致`).not.toMatch(/\bas\s+(any|unknown)\b|:\s*any\b|<any>|@ts-(ignore|expect-error|nocheck)/)
    }
    expect(read(dir, 'web/src/pages/OrderStatusPage.vue'), '訂單頁要繼續用 <PickupTime> 顯示取餐時間，不要把功能拿掉').toMatch(/<PickupTime\b/)
  })

  it('PickupTime 的 prop 型別就是契約的字串，不再接受 Date', () => {
    const code = read(dir, COMPONENT)
    const props = code.match(/defineProps\s*(<[\s\S]*?>)?\s*\(([\s\S]*?)\)/)
    expect(props, 'PickupTime.vue 要用 defineProps 宣告 at').not.toBeNull()
    expect(code, 'defineProps([\'at\']) 這種寫法的 prop 型別是 any，型別檢查等於關掉；寫 defineProps<{ at: string }>()').not.toMatch(/defineProps\s*\(\s*\[/)
    expect(props![0], 'prop 的型別不要留著 Date（例如 Date | string）：API 回的 JSON 裡沒有 Date，型別要跟實際收到的資料一致').not.toMatch(/\bDate\b/)
  })
})
