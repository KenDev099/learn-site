// node examples/where-am-i.ts：ES module 裡「我是誰、我在哪」
console.log('import.meta.url     ', import.meta.url)
console.log('import.meta.filename', import.meta.filename)
console.log('import.meta.dirname ', import.meta.dirname)
console.log('import.meta.main    ', import.meta.main)
console.log('typeof require      ', typeof require)
console.log('typeof __dirname    ', typeof __dirname)
