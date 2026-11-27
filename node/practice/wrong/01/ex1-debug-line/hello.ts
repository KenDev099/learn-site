const name = process.argv[2]
console.log('argv:', process.argv)
console.log(name ? `☕ ${name}，歡迎光臨！（Node ${process.version}）` : `☕ 歡迎光臨！（Node ${process.version}）`)
