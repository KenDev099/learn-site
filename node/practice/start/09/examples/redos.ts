// 災難性回溯：node examples/redos.ts
// 「一個以上的單字，中間可以有空白」，對結尾多一個 ! 的字串，每多一個字母時間約變兩倍
const re = /^(\w+\s?)*$/
for (let n = 16; n <= 28; n += 2) {
  const input = 'a'.repeat(n) + '!'
  const t = performance.now()
  re.test(input)
  console.log(`${n} 個 a：${(performance.now() - t).toFixed(1)}ms`)
}
