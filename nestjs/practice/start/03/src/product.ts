export type Category = 'coffee' | 'tea' | 'food'

export type Product = {
  id: number
  name: string
  price: number
  category: Category
}

export type CreateProductInput = Omit<Product, 'id'>
export type UpdateProductInput = Partial<CreateProductInput>
