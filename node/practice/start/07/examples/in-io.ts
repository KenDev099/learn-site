// 執行：node examples/in-io.ts
// 在 I/O callback（讀完檔案）裡排工作：接下來是 check phase，所以 setImmediate 一定比 setTimeout 先
import { readFile } from 'node:fs'

readFile(import.meta.filename, () => {
  setTimeout(() => console.log('timeout'), 0)
  setImmediate(() => console.log('immediate'))
  Promise.resolve().then(() => console.log('promise'))
  process.nextTick(() => console.log('nextTick'))
  console.log('readFile callback')
})
