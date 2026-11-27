import { Controller, HttpStatus, Param, ParseFilePipeBuilder, ParseIntPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ProductsService } from './products.service.js'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post(':id/image')
  // multer 收到超過 2MB 就停下來回 413，大檔案不會整個進記憶體
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(
      new ParseFilePipeBuilder()
        // 看檔頭（magic number），不是看副檔名或 Content-Type；overrideMimeType 讓 file.mimetype 變成偵測到的類型
        .addFileTypeValidator({ fileType: /^image\/(png|jpeg)$/, overrideMimeType: true })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    ) file: Express.Multer.File,
  ) {
    return this.products.saveImage(id, file)
  }
}
