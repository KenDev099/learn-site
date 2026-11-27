// node examples/mini-loader.ts：30 行的迷你 DataLoader，看懂「同一輪收集 key、一次送出」的原理
// 正式程式用 dataloader 套件（多了快取、錯誤處理、maxBatchSize）
type Job<K, V> = { key: K, resolve: (value: V) => void, reject: (error: unknown) => void }

function createMiniLoader<K, V>(batch: (keys: K[]) => Promise<V[]>) {
  let queue: Job<K, V>[] = []
  async function dispatch() {
    const jobs = queue
    queue = []                                   // 之後的 load 進下一批
    try {
      const values = await batch(jobs.map(j => j.key))
      jobs.forEach((job, i) => job.resolve(values[i]))   // 第 i 個 key 拿第 i 個值
    } catch (error) {
      jobs.forEach(job => job.reject(error))
    }
  }
  return {
    load(key: K): Promise<V> {
      return new Promise<V>((resolve, reject) => {
        queue.push({ key, resolve, reject })
        if (queue.length === 1) queueMicrotask(dispatch)   // 這一批的第一個 key：排定「目前的同步程式跑完後」送出
      })
    },
  }
}

const names = new Map([[1, '王小明'], [2, '陳美華'], [3, '林志豪']])
const customer = createMiniLoader(async (ids: number[]) => {
  console.log('batch 收到 keys：', ids)        // 真的程式在這裡發一句 SELECT … WHERE id = ANY($1)
  return ids.map(id => names.get(id) ?? null)
})

// 同一段同步程式裡的三次 load → 合成一批
const first = await Promise.all([customer.load(2), customer.load(1), customer.load(2)])
console.log('第一批結果：', first)

// 等過一次之後才 load → 另一批
console.log('第二批結果：', await customer.load(3))
