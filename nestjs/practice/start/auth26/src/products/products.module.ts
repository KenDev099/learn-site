import { Module } from '@nestjs/common'
import { ImageImportService } from './image-import.service.js'
import { DnsResolver, HttpFetcher } from './net.js'
import { ProductsController } from './products.controller.js'

@Module({
  controllers: [ProductsController],
  providers: [ImageImportService, DnsResolver, HttpFetcher],
})
export class ProductsModule {}
