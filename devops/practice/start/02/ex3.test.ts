// 練習 3：backup-config.sh 失敗時要以非 0 結束，而且不能留下半成品或弄壞舊的備份
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-02-ex3'
const OUT = '/backup/cafe-config.tar.gz'
// 在容器裡準備 /etc/cafe 和 /backup，執行學習者的腳本，印出結束碼、/backup 的內容和檢查結果
function scenario(src: string, prepare: string, check: string, as = 'root') {
  const script = [
    'set -e', 'mkdir -p /etc/cafe/conf.d /backup', `echo "TOKEN=$TOKEN" > /etc/cafe/app.env`, 'echo "listen 80;" > "/etc/cafe/conf.d/menu site.conf"',
    prepare, 'set +e', `runuser -u ${as} -- bash /w/backup-config.sh ${src} ${OUT}; echo "EXIT=$?"`, 'echo "FILES=$(ls -A /backup | tr "\\n" " ")"', check,
  ].join('\n')
  const r = run('docker', ['run', '--rm', '--name', NAME, '-e', `TOKEN=${randomUUID()}`, '-v', `${dir}:/w:ro`, 'debian:trixie-slim', 'bash', '-c', script], { timeout: 180_000 })
  assert.equal(r.code, 0, `測試環境建不起來：${r.stderr}`)
  const exit = Number(r.stdout.match(/^EXIT=(\d+)$/m)?.[1] ?? NaN)
  const files = (r.stdout.match(/^FILES=(.*)$/m)?.[1] ?? '').trim().split(' ').filter(Boolean)
  return { exit, files, out: r.stdout, err: r.stderr }
}

before(() => { requireDocker(); removeContainers(NAME) })
after(() => removeContainers(NAME))

test('正常情況：結束碼 0，產生一個解得開、內容正確的 tar.gz', () => {
  const r = scenario('/etc/cafe', 'true', `mkdir /restore && tar -xzf ${OUT} -C /restore && grep -rqF "$TOKEN" /restore && echo RESTORED`)
  assert.equal(r.exit, 0, `正常備份應該成功，結果結束碼是 ${r.exit}：${r.err}`)
  assert.deepEqual(r.files, ['cafe-config.tar.gz'], `/backup 裡應該只有 cafe-config.tar.gz，實際是：${r.files.join(', ') || '（空的）'}`)
  assert.match(r.out, /^RESTORED$/m, '備份解開後找不到 /etc/cafe/app.env 的內容：檢查 tar 的來源資料夾')
})

test('來源資料夾不存在：結束碼不是 0，也不留下任何檔案', () => {
  const r = scenario('/etc/nope', 'true', 'true')
  assert.notEqual(r.exit, 0, 'tar 失敗了，但腳本回 0：管線的結束碼只看最後一段（gzip），要加 set -o pipefail，也不能用 || true 吞掉錯誤')
  assert.deepEqual(r.files, [], `失敗後 /backup 應該是空的，實際留下：${r.files.join(', ')}。先寫到暫存檔，成功才 mv 成正式檔名，失敗時刪掉暫存檔（trap）`)
})

test('已經有一份好的舊備份時失敗：舊備份要原封不動', () => {
  const r = scenario('/etc/nope', `tar -czf ${OUT} -C /etc/cafe . && sha256sum ${OUT} > /old.sum`, 'sha256sum -c --quiet /old.sum && echo OLD_INTACT')
  assert.notEqual(r.exit, 0, '來源不存在時腳本要以非 0 結束')
  assert.deepEqual(r.files, ['cafe-config.tar.gz'], `/backup 裡應該只剩舊的 cafe-config.tar.gz，實際是：${r.files.join(', ') || '（空的，舊備份被刪了）'}`)
  assert.match(r.out, /^OLD_INTACT$/m, '舊備份被覆蓋了：直接寫到正式檔名，失敗時舊的那份就毀了。先寫暫存檔，成功才 mv 過去')
})

test('來源資料夾在、但 tar 讀不到其中一個檔案：管線失敗要被發現，舊備份不能被蓋掉', () => {
  // 用一般使用者 cafe 執行：secret.key 只有 root 能讀，tar 會失敗，但後面的 gzip 照樣成功
  const prepare = `useradd -M cafe && echo k > /etc/cafe/secret.key && chmod 600 /etc/cafe/secret.key && chown cafe /backup && tar -czf ${OUT} -C /etc/cafe . && chown cafe ${OUT} && sha256sum ${OUT} > /old.sum`
  const r = scenario('/etc/cafe', prepare, 'sha256sum -c --quiet /old.sum && echo OLD_INTACT', 'cafe')
  assert.notEqual(r.exit, 0, `tar 讀不到 secret.key 而失敗，但腳本回 0：只檢查來源資料夾存不存在不夠，要加 set -o pipefail，管線前段的失敗才算數。stderr：${r.err}`)
  assert.deepEqual(r.files, ['cafe-config.tar.gz'], `/backup 裡應該只剩舊的 cafe-config.tar.gz，實際是：${r.files.join(', ') || '（空的，舊備份被刪了）'}`)
  assert.match(r.out, /^OLD_INTACT$/m, '舊備份被少了 secret.key 的新檔蓋掉了：先寫暫存檔，整條管線成功才 mv 過去')
})
