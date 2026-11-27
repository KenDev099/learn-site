// 測試檔的第一行 import 這個檔：把全域的 fetch 換成會丟錯的版本
// 所以就算程式自己 new Anthropic()、電腦上又設了 ANTHROPIC_API_KEY，測試也不會真的呼叫 API、不會花錢
globalThis.fetch = async () => {
  throw new Error('測試時不連網路：請用測試傳進來的 client（函式參數），不要自己 new Anthropic()')
}
