// node examples/cause.ts：cause 鏈、Error.isError、JSON.stringify 的陷阱
import { inspect } from 'node:util'

const dbError = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
class UpstreamError extends Error {
  code = 'UPSTREAM_UNAVAILABLE'
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UpstreamError'
  }
}
const err = new UpstreamError('資料庫查詢逾時', { cause: dbError })

console.log('err.cause === dbError：', err.cause === dbError)
console.log('JSON.stringify(err)：', JSON.stringify(err))
console.log('Error.isError(err)：', Error.isError(err), '／Error.isError({ message })：', Error.isError({ message: 'x' }))
console.log('---- util.inspect（console.log 印 Error 時用的就是它）----')
console.log(inspect(err, { depth: 1 }).replace(/\n\s+at [^\n]*/g, m => m.endsWith(' {') ? ' {' : ''))   // 拿掉 stack 的 at … 行，比較好讀
