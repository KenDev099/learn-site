// 練習 1：node order.ts --drink 拿鐵 --size L --qty 2  →  拿鐵 L ×2 = 260
import { parseArgs } from 'node:util'
import { menu, sizeExtra } from './menu.ts'

const usage = '用法：node order.ts --drink <品項> [--size S|M|L] [--qty|-q <數量>]'

// 使用者打錯參數：跟程式自己的 bug 分開，才知道哪些要印說明、哪些要照常丟出去
class UsageError extends Error {}

function parseOrder(args: string[]) {
  let values
  {
    ({ values } = parseArgs({
      args,
      options: {
        drink: { type: 'string' },
        size: { type: 'string', default: 'M' },
        qty: { type: 'string', short: 'q', default: '1' },
      },
    }))
  }
  const { drink, size, qty } = values
  if (drink === undefined) throw new UsageError('缺少 --drink')
  if (!Object.hasOwn(menu, drink)) throw new UsageError(`沒有這個品項：${drink}`)
  if (!Object.hasOwn(sizeExtra, size)) throw new UsageError(`尺寸只能是 S、M、L：${size}`)
  if (!/^[1-9]\d*$/.test(qty)) throw new UsageError(`數量要是正整數：${qty}`)
  return { drink, size, qty: Number(qty) }
}

try {
  const { drink, size, qty } = parseOrder(process.argv.slice(2))
  console.log(`${drink} ${size} ×${qty} = ${(menu[drink] + sizeExtra[size]) * qty}`)
} catch (err) {
  if (!(err instanceof UsageError)) throw err
  console.error(`錯誤：${err.message}\n${usage}`)
  process.exitCode = 2
}
