// 練習 2：CI 用的 schema 檢查。oldSdl 是 main 分支的 schema，newSdl 是這個 PR 的，operations 是前端實際在用的查詢文件
// 回傳：
//   unusedRemovals：被移除、但沒有任何操作用到的欄位座標（'Type.field'），排序後回傳；不讓 ok 變 false
//   breaking：其他破壞性變更（被移除且有人在用的欄位、改型別、參數改必填…），每項一個字串，要帶出 'Type.field'
//   ok：breaking 是空的
export type CheckResult = { ok: boolean, breaking: string[], unusedRemovals: string[] }

export function checkSchema(oldSdl: string, newSdl: string, operations: string[]): CheckResult {
  return { ok: true, breaking: [], unusedRemovals: [] }
}
