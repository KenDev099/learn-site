// 練習 2：@Catch() 接住其他所有例外。非預期的錯誤一律回 500 與固定訊息，並用 Logger 記錄堆疊
// 練習 3：HttpException 保留原本的狀態碼與內容，補上 errorCode 與 requestId
export class AllExceptionsFilter {}
