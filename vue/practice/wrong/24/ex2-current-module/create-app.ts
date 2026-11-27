import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CartPage from './CartPage.vue'
import { CART_KEY, setCurrentCart, type Cart } from './cart.ts'

export function createApp(owner: string) {
  const cart = reactive<Cart>({ owner, items: [] })
  const app = createSSRApp(CartPage)
  app.provide(CART_KEY, cart)
  return { app, cart }
}

export async function renderPage(owner: string, load: (cart: Cart) => Promise<void>): Promise<string> {
  const { app, cart } = createApp(owner)
  await load(cart)
  setCurrentCart(cart)
  return renderToString(app)
}
