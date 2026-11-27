const name = process.argv[2]
const version = `（Node ${process.version}）`

console.log(name ? `☕ ${name}，歡迎光臨！${version}` : `☕ 歡迎光臨！${version}`)
