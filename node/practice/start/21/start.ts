// 練習 3：啟動時等依賴就緒
// start({ checkDb, listen })：checkDb 成功才 listen；失敗就退避重試（100、200、400、800ms），最多 5 次
// 每次失敗都用 console.error 印出原因；5 次都失敗就以結束碼 1 結束
export type StartDeps = {
  checkDb: () => Promise<void>
  listen: () => Promise<void>
}

export async function start({ checkDb, listen }: StartDeps) {
  // TODO：現在沒檢查就直接開始服務
  await listen()
}
