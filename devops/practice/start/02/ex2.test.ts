// 練習 2：fix-perms.sh 依副檔名設定權限與擁有者。在容器自己的檔案系統裡建一棵新的資料夾樹（不是 bind mount），執行後用 find 檢查每一項
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-02-ex2'
// 路徑（相對於資料夾）→ [一開始的權限, 期望的權限, 期望的擁有者]；'' 是資料夾本身
const TREE: Record<string, [string, string, string]> = {
  '': ['700', '755', 'root'],
  'scripts': ['777', '755', 'root'],
  'config': ['700', '755', 'root'],
  'config/conf.d': ['750', '755', 'root'],
  'keys': ['700', '755', 'root'],
  'empty dir': ['700', '755', 'root'],
  'deploy.sh': ['644', '755', 'root'],
  'scripts/backup.sh': ['600', '755', 'root'],
  'my secret.env': ['644', '600', 'cafe'],
  'config/app.env': ['666', '600', 'cafe'],
  'config/.env': ['644', '600', 'cafe'],
  'notes.env.bak': ['600', '644', 'root'],
  'keys/server.pem': ['644', '600', 'root'],
  '-deploy.pem': ['664', '600', 'root'],
  'README.md': ['755', '644', 'root'],
  'config/conf.d/nginx.conf': ['600', '644', 'root'],
  'config/menu list.txt': ['777', '644', 'root'],
}
const q = (s: string) => `'${s}'`
const dirs = ['', 'scripts', 'config', 'config/conf.d', 'keys', 'empty dir']
const files = Object.keys(TREE).filter(p => !dirs.includes(p))
const setup = [
  'set -e', 'useradd -M -u 1000 cafe', 'R="/srv/cafe app"',
  ...dirs.map(p => `mkdir -p "$R"/${q(p)}`),
  ...files.map(p => `echo x > "$R"/${q(p)}`),
  ...Object.entries(TREE).map(([p, [m]]) => `chmod ${m} "$R"/${q(p)}`),
  'set +e', 'bash /w/fix-perms.sh "$R"; echo "EXIT=$?"',
  'cd "$R" && find . -printf "%m\\t%u\\t%P\\n"',
].join('\n')

let out = '', code: number | null = null
before(() => {
  requireDocker(); removeContainers(NAME)
  const r = run('docker', ['run', '--rm', '--name', NAME, '-v', `${dir}:/w:ro`, 'debian:trixie-slim', 'bash', '-c', setup], { timeout: 180_000 })
  assert.equal(r.code, 0, `測試環境建不起來：${r.stderr}`)
  out = r.stdout + '\n' + r.stderr
  code = Number(r.stdout.match(/^EXIT=(\d+)$/m)?.[1] ?? NaN)
})
after(() => removeContainers(NAME))

const seen = () => new Map(out.split('\n').filter(l => l.includes('\t')).map(l => { const [m, u, p] = l.split('\t'); return [p, [m, u]] }))

test('對 "/srv/cafe app" 執行 fix-perms.sh 要成功（結束碼 0）', () => {
  assert.equal(code, 0, `fix-perms.sh 失敗了。輸出：\n${out.replace(/^.*\t.*$/gm, '').trim()}\n提示：資料夾名稱有空白（"$dir" 要加引號），還有一個叫 -deploy.pem 的檔案（指令會把它當成選項）`)
})

test('資料夾都是 755：少了 x 就進不去', () => {
  const s = seen()
  for (const p of dirs) assert.equal(s.get(p)?.[0], '755', `資料夾「${p || '.'}」應該是 755，現在是 ${s.get(p)?.[0]}：資料夾要有 x 才能進入（chmod -R 644 會讓它失去 x）`)
})

test('*.sh 755、*.env 與 *.pem 600、其他檔案 644', () => {
  const s = seen()
  for (const p of files) assert.equal(s.get(p)?.[0], TREE[p][1], `「${p}」應該是 ${TREE[p][1]}，現在是 ${s.get(p)?.[0]}`)
})

test('只有 *.env 的擁有者是 cafe，其他維持 root', () => {
  const s = seen()
  for (const p of Object.keys(TREE)) assert.equal(s.get(p)?.[1], TREE[p][2], `「${p || '.'}」的擁有者應該是 ${TREE[p][2]}，現在是 ${s.get(p)?.[1]}`)
})
