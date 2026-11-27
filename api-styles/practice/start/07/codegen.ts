// 練習 1：graphql-codegen 的設定。node check.mjs 每次跑測試前會自動執行一次；自己跑：npx graphql-codegen --config codegen.ts
// 要做到：
// - documents 涵蓋 src 底下（含子資料夾）所有的 .graphql
// - 用 client preset 輸出到 src/gql/，另外輸出 persisted-documents.json
// - 產生的程式要能被 Node 直接執行：import 帶 .ts 副檔名、只有型別的 import 寫成 import type
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'schema.graphql',
  documents: [],
  generates: {},
}

export default config
