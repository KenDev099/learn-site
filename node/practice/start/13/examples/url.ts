// node examples/url.ts：req.url 只有「路徑＋查詢字串」，用 URL 拆開
const raw = '/orders?status=ready&drink=%E6%8B%BF%E9%90%B5&drink=%E7%BE%8E%E5%BC%8F%E5%92%96%E5%95%A1&page=2'
const url = new URL(raw, 'http://localhost')

console.log('pathname:', url.pathname)
console.log('status:', url.searchParams.get('status'))
console.log('drink（get）:', url.searchParams.get('drink'))
console.log('drink（getAll）:', url.searchParams.getAll('drink'))
console.log('沒有的參數:', url.searchParams.get('size'))
console.log('手動 split:', raw.split('?')[1].split('&'))
