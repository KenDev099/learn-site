// graphql-codegen 的設定（不用改，第 7 課寫過）。node check.mjs 每次跑測試前會自動執行，產生 app/gql/
// app/gql/persisted-documents.json 就是正式環境的白名單（練習 2 用）
import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'graphql/schema.graphql',
  documents: ['app/**/*.graphql'],
  generates: {
    'app/gql/': {
      preset: 'client',
      presetConfig: { persistedDocuments: true },
      config: { importExtension: '.ts', useTypeImports: true },
    },
  },
}

export default config
