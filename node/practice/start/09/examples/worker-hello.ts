// 最小的 worker：node examples/worker-hello.ts
// 同一個檔案用兩次：主執行緒建立 Worker，worker 裡 isMainThread 是 false
import { Worker, isMainThread, parentPort, threadId, workerData } from 'node:worker_threads'

if (isMainThread) {
  const order = { item: '拿鐵', qty: 2 }
  const worker = new Worker(new URL(import.meta.url), { workerData: order })
  worker.on('message', msg => console.log('主執行緒收到：', msg))
  worker.on('error', err => console.error('worker 丟錯：', err.message))
  worker.on('exit', code => console.log('worker 結束，結束碼', code))
  order.qty = 99   // 改主執行緒這份，worker 拿到的是複製品，不受影響
  console.log('主執行緒 threadId', threadId)
} else {
  // worker 裡：workerData 是複製過來的資料
  parentPort!.postMessage({ from: threadId, got: workerData })
}
