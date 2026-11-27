/*
練習 4（上半）：用 context 注入 API 用戶端（ApiProvider 與 useApi）
問題：MenuCount.tsx 直接 import realClient，跟「真的連到後端」綁死了：測試會打真的 API，
      展示頁想換成假資料也只能改元件。
要求：
  1. <ApiProvider api={某個 MenuApi}>：把 api 提供給底下所有元件；api 這個 prop 換了，底下拿到的也要換
  2. useApi() 回傳最近一層 ApiProvider 的 api；
     上面沒有 ApiProvider 時丟出 Error('useApi() 必須在 <ApiProvider> 之下使用')
不能做的事：
  - 不能把 realClient 當預設值（忘了放 ApiProvider 時要馬上知道，而不是在測試裡偷偷連到正式環境）
  - 不能把 api 存在模組層級的變數（兩個 ApiProvider 要各自獨立）
*/
import { type ReactNode } from 'react'
import { realClient, type MenuApi } from './real-client.ts'

export function ApiProvider({ children }: { api: MenuApi; children: ReactNode }) {
  return <>{children}</>
}

export function useApi(): MenuApi {
  return realClient
}
