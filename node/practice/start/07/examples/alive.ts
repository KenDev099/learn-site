// 執行：node examples/alive.ts
// 看看是誰讓程序活著：process.getActiveResourcesInfo() 列出還撐著程序的資源
import { createServer } from 'node:http'

const server = createServer().listen(0)
const ticker = setInterval(() => {}, 1000)
const reminder = setTimeout(() => {}, 60_000)
reminder.unref()   // unref：這個計時器不撐住程序，所以下面的清單裡也看不到它

console.log('開著：', process.getActiveResourcesInfo())

clearInterval(ticker)
server.close()     // 關閉是非同步的，要等下一輪 loop 才真的關好

process.on('beforeExit', () => console.log('beforeExit：loop 空了', process.getActiveResourcesInfo()))
process.on('exit', code => console.log('exit：結束碼', code))
