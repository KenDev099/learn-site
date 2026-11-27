// 執行：node examples/once-timeout.ts; echo "結束碼 $?"
// 程式唯一在等的是 once 加上 AbortSignal.timeout(1000)：timeout 的計時器不撐住程序
import { EventEmitter, once } from 'node:events'

const board = new EventEmitter()
try {
  await once(board, 'ready', { signal: AbortSignal.timeout(1000) })
  console.log('等到了')
} catch (err) {
  console.log('逾時了', err)
}
