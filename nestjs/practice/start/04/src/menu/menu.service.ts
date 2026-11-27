import { Injectable } from '@nestjs/common'
import { MenuSource, type Drink } from './menu.source.js'

@Injectable()
export class MenuService {
  private items: Drink[] = []

  constructor(private readonly source: MenuSource) {}

  findAll(): Drink[] {
    return this.items
  }
}
