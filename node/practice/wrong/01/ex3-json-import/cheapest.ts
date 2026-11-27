import menu from './data/menu.json' with { type: 'json' }

const cheapest = menu.reduce((a, b) => (b.price < a.price ? b : a))
console.log(`最便宜：${cheapest.name} ${cheapest.price} 元`)
