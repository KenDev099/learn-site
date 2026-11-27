// npm run dev：同時啟動 API（api/，nest start --watch）、前台（web/，vite）與假金流商 CafePay（cafepay/server.mjs，3190），Ctrl-C 一起關掉
import { spawn } from 'node:child_process'

const procs = [
  spawn('nest', ['start', '--watch'], { cwd: 'api', stdio: 'inherit' }),
  spawn('vite', [], { cwd: 'web', stdio: 'inherit' }),
  spawn('node', ['cafepay/server.mjs'], { stdio: 'inherit' }),
]
for (const p of procs) p.on('exit', code => {
  for (const q of procs) q.kill()
  process.exitCode = code ?? 0
})
