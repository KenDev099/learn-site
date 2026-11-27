// node examples/parse-args.ts --drink 拿鐵 -q 2 --no-hot
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  options: {
    drink: { type: 'string' },
    qty: { type: 'string', short: 'q', default: '1' },
    hot: { type: 'boolean', default: true },
  },
  allowNegative: true,   // 讓 --no-hot 把 hot 設成 false（v22.4.0 起）
})
console.log(values, positionals)
console.log('qty 的型別：', typeof values.qty)
