import { PartialType } from '@nestjs/mapped-types'
import { CreateProductDto } from './create-product.dto.js'

// skipNullProperties: false：沒傳（undefined）才跳過驗證，null 照樣驗證 → 400
export class UpdateProductDto extends PartialType(CreateProductDto, { skipNullProperties: false }) {}
