// 前後端共用的契約：下單的請求、回應與錯誤格式只寫在這裡一次
// API 用它驗證收到的請求（@Body({ schema })），前台用它檢查收到的回應（safeParse）
// import 路徑：API 寫 '../../../shared/contract.js'（nodenext 要寫 .js），前台寫 '../../../shared/contract.ts'
import { z } from 'zod'

// 練習 1：照課程頁的「跟著做」寫 OrderResponse，再寫 OrderRequest 與 ApiErrorBody
// 每一個都同時匯出 schema（執行時檢查）和同名的型別（z.infer）
