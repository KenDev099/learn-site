console.log('counter.ts 的最外層執行了')

let count = 0
export function next() {
  return ++count
}
