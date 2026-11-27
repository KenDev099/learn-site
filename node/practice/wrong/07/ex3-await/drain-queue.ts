// 錯誤寫法：改成 async，中間 await 一個已完成的 Promise，以為這樣就會讓出 event loop
export async function drainQueue<T>(items: T[], handle: (item: T) => void): Promise<void> {
  for (const item of items) {
    handle(item)
    await Promise.resolve()
  }
}
