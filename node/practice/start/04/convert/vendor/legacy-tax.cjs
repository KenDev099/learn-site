// 一個舊的稅金套件（CommonJS，不要改這個檔）
// module.exports 是「呼叫函式的結果」，Node 沒辦法事先看出裡面有哪些名字
function buildApi(rate) {
  return {
    rate,
    calcTax(price) { return Math.round(price * rate) },
  }
}

module.exports = buildApi(0.05)
