import { api } from './client.ts'

export interface Product {
  id: number
  name: string
  price: number
}

export const listProducts = () => api<Product[]>('/products')
