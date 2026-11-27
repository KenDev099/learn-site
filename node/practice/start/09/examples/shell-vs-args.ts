// exec 與 execFile 的差別：node examples/shell-vs-args.ts
// 名字是使用者輸入的；$(whoami) 只會印出你的帳號名稱，不會造成破壞
import { exec, execFile } from 'node:child_process'

const name = '小明 $(whoami)'

exec(`echo 你好，${name}`, (err, stdout) => {
  console.log('exec     →', stdout.trim())      // shell 把 $(whoami) 當成指令執行了
})
execFile('echo', ['你好，', name], (err, stdout) => {
  console.log('execFile →', stdout.trim())      // 名字原封不動
})
