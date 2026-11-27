// 第 6 課測試共用的工具（這個檔案不用改）
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { docker, run } from '../../../helpers/docker.ts'

export const SERVER = 'ld-06-server'
export const sh = (dir: string, script: string, timeout = 120_000) => run('sh', [script], { cwd: dir, timeout })
export const inServer = (cmd: string) => docker('exec', SERVER, 'sh', '-c', cmd)
// 測試自己連線時：不用 ssh-agent、不准問密碼、主機金鑰一定要對得上 known_hosts
export const ssh = (dir: string, ...args: string[]) =>
  run('ssh', ['-F', 'ssh_config', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', 'cafe-server', ...args], { cwd: dir, timeout: 30_000 })

// 等 127.0.0.1:18060 的 sshd 回應
export async function waitSsh(timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (run('ssh-keyscan', ['-T', '2', '-p', '18060', '-t', 'ed25519', '127.0.0.1'], { timeout: 5_000 }).stdout.includes('ssh-ed25519')) return
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('127.0.0.1:18060 的 SSH 一直沒有回應：docker logs ld-06-server 看看伺服器有沒有開機')
}

// 練習 2、3 用：用練習 1 的檔案啟動伺服器並信任它的主機金鑰
export async function startServer(dir: string) {
  if (!existsSync(join(dir, 'keys', 'id_ed25519')) || !existsSync(join(dir, 'authorized_keys'))) {
    const k = sh(dir, 'keygen.sh')
    if (k.code !== 0) throw new Error(`這一題要用練習 1 的金鑰：先完成練習 1 的 keygen.sh。\n${k.stderr}`)
  }
  const up = sh(dir, 'server/up.sh', 600_000)
  if (up.code !== 0) throw new Error(`練習伺服器啟動失敗：${up.stderr || up.stdout}`)
  await waitSsh()
  const t = sh(dir, 'trust-host.sh')
  if (t.code !== 0) throw new Error(`這一題要用練習 1 的 trust-host.sh 建立 known_hosts，它失敗了：先完成練習 1。\n${t.stderr}`)
  const who = ssh(dir, 'whoami')
  if (who.stdout !== 'ubuntu') throw new Error(`用 ssh -F ssh_config cafe-server 登入失敗：先完成練習 1。\n${who.stderr}`)
}
