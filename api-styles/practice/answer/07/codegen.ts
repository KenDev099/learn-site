// 練習 1：graphql-codegen 的設定。node check.mjs 每次跑測試前會自動執行一次；自己跑：npx graphql-codegen --config codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'schema.graphql',
  // src 底下所有的 .graphql 都是前端要送的操作
  documents: ['src/**/*.graphql'],
  generates: {
    'src/gql/': {
      preset: 'client',
      // 另外輸出 persisted-documents.json：{ "sha256:…": "查詢文字" }，給伺服器當白名單（第 6 課）
      presetConfig: { persistedDocuments: true },
      config: {
        importExtension: '.ts',   // 產生的 import 寫成 './graphql.ts'：Node 直接執行 .ts 時要有副檔名
        useTypeImports: true,     // 只有型別的 import 寫成 import type，執行時整行消失
      },
    },
  },
}

export default config
