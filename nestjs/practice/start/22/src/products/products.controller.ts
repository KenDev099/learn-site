import { Controller, Param, ParseIntPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // 練習 1：表單欄位 image 的檔案。現在什麼都收、多大都收
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    return this.products.saveImage(id, file)
  }
}
