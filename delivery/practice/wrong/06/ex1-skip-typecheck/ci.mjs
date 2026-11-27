// npm run ci：在本機跑一次跟 CI 一樣的檢查，結果寫到 ci-report.json
// CI（每個 PR、每次推到 main）跑的就是這個檔案，所以本機過了，CI 就會過；不要為了讓它變綠去改這個檔案
//   1. deps       package.json 寫的版本要跟 lockfile 鎖定的一樣（npm ci 的規則：不一樣就直接失敗）
//   2. typecheck  tsc（api）與 vue-tsc（web）。Vite 與 Vitest 都只轉譯、不檢查型別，只有這一步會抓到型別錯誤
//   3. test       npm test，但 TZ=UTC（跟 CI 機器、正式機一樣），而且每次用不同的隨機順序跑
// 三步都會跑完，最後一起列出結果；讀的時候從第一個失敗的步驟、第一個錯誤開始看
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = import.meta.dirname

// 往上層資料夾找：這門課所有專案共用 learn/delivery/practice/ 的安裝（node_modules 與 package-lock.json）
function findUp(name, from) {
  for (let d = from; ; d = dirname(d)) {
    if (existsSync(join(d, name))) return join(d, name)
    if (dirname(d) === d) throw new Error(`找不到 ${name}`)
  }
}
const bin = name => findUp(join('node_modules', '.bin', name), root)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 300_000, env: { ...env, NO_COLOR: '1', ...extraEnv } })
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

function deps() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(findUp('package-lock.json', dirname(root)), 'utf8'))
  const wanted = { ...pkg.dependencies, ...pkg.devDependencies }
  const bad = Object.entries(wanted).filter(([name, version]) => lock.packages[`node_modules/${name}`]?.version !== version)
  if (!bad.length) return { ok: true, output: `${Object.keys(wanted).length} 個套件的版本都跟 lockfile 一致` }
  return {
    ok: false,
    output: [
      'npm error code EUSAGE',
      'npm error',
      'npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.',
      'npm error',
      ...bad.map(([name, version]) => {
        const locked = lock.packages[`node_modules/${name}`]?.version
        return locked ? `npm error Invalid: lock file's ${name}@${locked} does not satisfy ${name}@${version}` : `npm error Missing: ${name}@${version} from lock file`
      }),
    ].join('\n'),
  }
}

function typecheck() {
  const results = [['tsc', 'api'], ['vue-tsc', 'web']].map(([tool, dir]) => {
    const r = run(bin(tool), ['--noEmit', '--pretty', 'false', '-p', join(dir, 'tsconfig.json')])
    return { ok: r.ok, output: `$ ${tool} --noEmit -p ${dir}\n${r.output || '（沒有錯誤）'}` }
  })
  return { ok: results.every(r => r.ok), output: results.map(r => r.output).join('\n\n') }
}

function test() {
  const seed = Date.now() % 100_000
  const r = run(bin('vitest'), ['run', '--sequence.shuffle', `--sequence.seed=${seed}`], { TZ: 'UTC' })
  return { ok: r.ok, output: `$ TZ=UTC vitest run --sequence.shuffle --sequence.seed=${seed}\n${r.output}` }
}

const steps = []
for (const [name, fn] of [['deps', deps], ['test', test]]) {
  console.log(`\n▶ ${name}`)
  const result = fn()
  steps.push({ name, ...result })
  console.log(result.output)
  console.log(result.ok ? `✓ ${name}` : `✗ ${name}`)
}
writeFileSync(join(root, 'ci-report.json'), JSON.stringify({ steps }, null, 2) + '\n')
console.log(`\n結果：${steps.map(s => `${s.ok ? '✓' : '✗'} ${s.name}`).join('  ')}（ci-report.json）`)
process.exitCode = steps.every(s => s.ok) ? 0 : 1
