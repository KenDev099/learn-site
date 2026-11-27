// 台北時間的日期字串，例如 2026-10-31T16:30:00Z → '2026-11-01'（台北已經是隔天 00:30）
// sv-SE 這個地區的日期格式剛好是 YYYY-MM-DD
const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })

export const taipeiDay = (date: Date) => formatter.format(date)
