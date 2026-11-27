// 測試用（練習 2）：測試會用 NODE_OPTIONS=--import 先載入這個檔案，學習者不用讀也不用改
// 程序觸發 'exit' 事件時，在 stdout 記一行 {"msg":"exit","code":N,"at":時間}
// 用 writeSync 直接寫出，就算是 process.exit() 也不會掉；測試用這一行判斷程序什麼時候、以什麼結束碼結束
import { writeSync } from 'node:fs'

process.on('exit', code => writeSync(1, JSON.stringify({ msg: 'exit', code, at: Date.now() }) + '\n'))
