// npm run dev：同時啟動 API（api/，nest start --watch）與前台（web/，vite），Ctrl-C 一起關掉
import { spawn } from 'node:child_process'

const procs = [
  spawn('nest', ['start', '--watch'], { cwd: 'api', stdio: 'inherit' }),
  spawn('vite', [], { cwd: 'web', stdio: 'inherit' }),
]
for (const p of procs) p.on('exit', code => {
  for (const q of procs) q.kill()
  process.exitCode = code ?? 0
})
