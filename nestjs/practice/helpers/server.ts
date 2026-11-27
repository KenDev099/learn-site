// 用正式的方式編譯、啟動學習者的專案（nest build → node dist/main.js），抓出「Vitest 會過、正式環境卻壞掉」的問題：
// import 少了 .js、ESM 循環 import、用 @ts-ignore 蓋掉的錯誤…
//   await build(dir)
//   const server = await start(dir)              // PORT 是系統分配的空 port
//   try { const res = await fetch(server.url + '/health') } finally { await server.stop() }
import { spawn, spawnSync } from 'node:child_process'
import { createServer, connect } from 'node:net'
import { join } from 'node:path'

const bin = (name: string) => join(import.meta.dirname, '..', 'node_modules', '.bin', name)
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-1500)

export function build(dir: string) {
  const r = spawnSync(bin('nest'), ['build'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  if (r.status !== 0) throw new Error(`npm run build（nest build）失敗：\n${clean(r.stdout + r.stderr)}`)
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })
}

const listening = (port: number) => new Promise<boolean>(resolve => {
  const socket = connect({ host: '127.0.0.1', port })
  socket.once('connect', () => { socket.destroy(); resolve(true) }).once('error', () => { socket.destroy(); resolve(false) })
})

export async function start(dir: string, { env = {}, timeout = 15_000, entry = 'dist/main.js' }: { env?: Record<string, string>; timeout?: number; entry?: string } = {}) {
  const port = await freePort()
  const child = spawn(process.execPath, [entry], { cwd: dir, env: { ...process.env, ...env, PORT: String(port) } })
  let output = ''
  child.stdout.on('data', d => { output += d })
  child.stderr.on('data', d => { output += d })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  let running = true
  void exited.then(() => { running = false })
  const stop = async () => {
    if (running) child.kill('SIGTERM')
    await Promise.race([exited, new Promise(r => setTimeout(r, 5000))])
    if (running) child.kill('SIGKILL')
  }
  const deadline = Date.now() + timeout
  while (!(await listening(port))) {
    if (!running) throw new Error(`node ${entry} 一啟動就結束了：\n${clean(output)}`)
    if (Date.now() > deadline) { await stop(); throw new Error(`node ${entry} 過了 ${timeout / 1000} 秒還沒開始接受連線（main.ts 有用 process.env.PORT 嗎？）：\n${clean(output)}`) }
    await new Promise(r => setTimeout(r, 100))
  }
  return { url: `http://127.0.0.1:${port}`, port, stop, output: () => output, child }
}
