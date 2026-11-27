// 練習 1：開工前要問店長的問題（questions.json）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPICS = ['time-zone', 'business-hours', 'lead-time', 'slot-capacity', 'cancellation', 'payment-timing']
const REQUIRED = ['time-zone', 'business-hours', 'lead-time', 'slot-capacity']
const questions = JSON.parse(readFileSync(join(import.meta.dirname, 'questions.json'), 'utf8'))

describe('練習 1：questions.json', () => {
  it('是 4–8 題的陣列', () => {
    expect(Array.isArray(questions), 'questions.json 要是陣列：[{ "topic": …, "question": …, "myDefault": … }, …]').toBe(true)
    expect(questions.length, `目前 ${questions.length} 題：問 4–8 題。太少會漏掉關鍵規則，太多店長不會認真回`).toBeGreaterThanOrEqual(4)
    expect(questions.length).toBeLessThanOrEqual(8)
  })

  it('每題的 topic 都是指定的六種之一', () => {
    for (const q of questions) {
      expect(TOPICS, `topic「${q?.topic}」不在清單裡，要從這六個選一個：${TOPICS.join('、')}`).toContain(q?.topic)
    }
  })

  it('涵蓋時區、營業時間、最快多久、每個時段能接幾單', () => {
    const asked = new Set(questions.map((q: { topic?: string }) => q?.topic))
    for (const t of REQUIRED) {
      expect(asked.has(t), `還沒問到 ${t}：這是做預約取餐一定會碰到的規則，不問清楚就會自己猜`).toBe(true)
    }
  })

  it('每題都是問句，而且附上你的預設答案', () => {
    for (const q of questions) {
      const question = typeof q?.question === 'string' ? q.question.trim() : ''
      const myDefault = typeof q?.myDefault === 'string' ? q.myDefault.trim() : ''
      expect(question && !/TODO/.test(question), `${q?.topic} 的 question 還沒寫`).toBeTruthy()
      expect(question, `「${question}」要以問號結尾：寫成一個能回答「是」或「不是」的問句`).toMatch(/[？?]$/)
      expect(question, `「${question}」是開放式問題，店長還得自己想答案。把你的預設答案寫進問句，用「…，對嗎？」「…，可以嗎？」這類能回「對／不對」的問法結尾`).toMatch(/(嗎|對不對|是不是|可不可以|好不好)[？?]$/)
      expect(myDefault && !/TODO/.test(myDefault), `「${question}」沒有附預設答案（myDefault）：寫出你打算怎麼做，店長只要回「對」或「不對」`).toBeTruthy()
    }
  })

  it('每一題都不一樣', () => {
    const texts = questions.map((q: { question?: string }) => String(q?.question).trim())
    expect(new Set(texts).size, '有重複的 question：每個 topic 要問它自己的規則，不能同一句複製好幾次').toBe(texts.length)
  })
})
