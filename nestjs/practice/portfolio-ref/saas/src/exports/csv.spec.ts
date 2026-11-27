import { cell, csv } from './csv.js'

describe('CSV', () => {
  it('逗號、雙引號、換行要包起來', () => {
    expect(cell('a,b')).toBe('"a,b"')
    expect(cell('說 "嗨"')).toBe('"說 ""嗨"""')
    expect(cell('一\n二')).toBe('"一\n二"')
  })

  it('公式開頭的值前面加單引號（CSV injection）', () => {
    for (const v of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(cell(v).startsWith("'") || cell(v).startsWith(`"'`)).toBe(true)
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
  })

  it('每列 CRLF 結尾', () => {
    expect(csv(['a'], [[1], [2]])).toBe('a\r\n1\r\n2\r\n')
  })
})
