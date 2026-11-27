import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeAnswer, normalize, type AssistantOutput, type EvalCase } from './ex2.ts'

const latte: EvalCase = { id: 'price-latte', question: '拿鐵多少錢？', mustInclude: ['110'], mustCite: ['menu'], shouldAbstain: false, severity: 'critical' }
const oat: EvalCase = { id: 'oat-milk', question: '拿鐵可以換燕麥奶嗎？要加錢嗎？', mustInclude: ['燕麥奶', '10 元'], mustCite: ['menu'], shouldAbstain: false, severity: 'normal' }
const outOfScope: EvalCase = { id: 'parking', question: '附近哪裡可以停車？', mustInclude: [], mustCite: [], shouldAbstain: true, severity: 'normal' }
const answered = (answer: string, sources: string[]): AssistantOutput => ({ status: 'answered', answer, sources })
const abstain: AssistantOutput = { status: 'abstain', answer: '這個問題我需要請店員確認', sources: [] }

test('正確的回答：包含事實、引用正確，pass 為 true、reasons 是空陣列', () => {
  assert.deepEqual(gradeAnswer(latte, answered('拿鐵一杯 110 元。', ['menu'])), { pass: true, reasons: [] })
})

test('全形數字「１１０」視為 110', () => {
  assert.equal(normalize('拿鐵 １１０ 元'), '拿鐵110元', 'normalize 要把全形數字轉半形並去掉空白（String.prototype.normalize(\'NFKC\')）')
  assert.equal(gradeAnswer(latte, answered('拿鐵一杯１１０元。', ['menu'])).pass, true, '全形的「１１０」跟「110」是同一個價格，要先正規化再比對')
})

test('全形英文、符號也轉半形：「Ｗｉ－Ｆｉ」視為 Wi-Fi', () => {
  assert.equal(normalize('Ｗｉ－Ｆｉ　密碼'), 'Wi-Fi密碼', 'normalize 不只處理數字：全形英文字母、符號也要轉半形，用 String.prototype.normalize(\'NFKC\') 一次處理')
})

test('空白不影響比對：期望「10 元」、回答「10元」或「１０　元」都算有', () => {
  assert.equal(gradeAnswer(oat, answered('可以換燕麥奶，加10元。', ['menu'])).pass, true, '比對前兩邊都去掉空白')
  assert.equal(gradeAnswer(oat, answered('可以換燕麥奶，加 １０　元。', ['menu'])).pass, true, '全形空白（\\u3000）也要去掉')
})

test('缺一個必要事實：不過，原因寫出缺了什麼', () => {
  const g = gradeAnswer(oat, answered('可以換燕麥奶喔！', ['menu']))
  assert.equal(g.pass, false, '少了「10 元」就不能過')
  assert.deepEqual(g.reasons, ['缺少：10 元'], '原因的格式是「缺少：<mustInclude 原本的字串>」')
})

test('缺引用：答案對但沒引用 menu，不過', () => {
  const g = gradeAnswer(latte, answered('拿鐵一杯 110 元。', []))
  assert.equal(g.pass, false, 'mustCite 的文件沒出現在 sources：回答可能是模型自己編的，不能過')
  assert.deepEqual(g.reasons, ['沒有引用：menu'], '原因的格式是「沒有引用：<文件 id>」')
})

test('多引用不扣分', () => {
  assert.equal(gradeAnswer(latte, answered('拿鐵一杯 110 元。', ['hours', 'menu'])).pass, true, 'sources 多了別的文件不算錯，只要 mustCite 都在')
})

test('兩個錯誤同時列出，不要遇到第一個就回傳', () => {
  const g = gradeAnswer(oat, answered('可以換喔！', ['hours']))
  assert.equal(g.pass, false)
  assert.deepEqual(g.reasons, ['缺少：燕麥奶', '缺少：10 元', '沒有引用：menu'], '要列出所有不符的地方：先 mustInclude 依序，再 mustCite 依序')
})

test('該拒答的題目：拒答才過', () => {
  assert.deepEqual(gradeAnswer(outOfScope, abstain), { pass: true, reasons: [] }, '超出範圍的問題，助理說要請店員確認就是對的')
})

test('該拒答卻回答了：不過', () => {
  const g = gradeAnswer(outOfScope, answered('門口右轉有收費停車場。', []))
  assert.equal(g.pass, false, 'shouldAbstain 是 true 時回答了就不能過：這是模型在編答案')
  assert.deepEqual(g.reasons, ['應該拒答'])
})

test('不該拒答卻拒答：不過', () => {
  const g = gradeAnswer(latte, abstain)
  assert.equal(g.pass, false, '價格是菜單上查得到的，拒答等於沒回答')
  assert.deepEqual(g.reasons, ['不應該拒答'])
})
