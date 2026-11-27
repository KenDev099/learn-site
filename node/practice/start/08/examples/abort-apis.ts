// 執行：node examples/abort-apis.ts
// Node 內建 API 取消時丟出的錯誤長什麼樣
import { EventEmitter, once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'

// 只剩 AbortSignal.timeout 的計時器時程序會直接結束（結束碼 13），先用一個 interval 撐著
const keepAlive = setInterval(() => {}, 1_000)

const show = (label: string, err: any) =>
  console.log(`${label}：name = ${err.name}，cause = ${err.cause?.name ?? '（沒有）'}`)

try { await sleep(5_000, null, { signal: AbortSignal.timeout(50) }) } catch (err) { show('timers/promises 逾時', err) }
try { await once(new EventEmitter(), 'ready', { signal: AbortSignal.timeout(50) }) } catch (err) { show('events.once 逾時', err) }
try { await readFile(import.meta.filename, { signal: AbortSignal.abort() }) } catch (err) { show('fs.readFile 已取消', err) }

// AbortSignal.any：任何一個來源取消，合併後的 signal 就取消，reason 跟著那個來源
const userCancel = new AbortController()
const signal = AbortSignal.any([userCancel.signal, AbortSignal.timeout(5_000)])
userCancel.abort()
try { await sleep(5_000, null, { signal }) } catch (err) { show('any：使用者先取消', err) }

clearInterval(keepAlive)
