import { Controller, Delete, ExecutionContext, Get, HttpCode, Module, Param, PayloadTooLargeException, Post, Res, StreamableFile, UploadedFile, UseInterceptors, type CallHandler } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import { Permissions } from '../auth/decorators.js'
import { ApiError } from '../common/api-error.js'
import { ApiErrors } from '../common/openapi.js'
import { UUID } from '../common/uuid.pipe.js'
import { attachment } from './file-type.js'
import { fileView, FilesService } from './files.service.js'
import { StorageService } from './storage.service.js'

export const MAX_FILE_BYTES = 5 * 1024 * 1024

// defParamCharset：檔名照 UTF-8 解（預設 latin1，中文檔名會變亂碼）。multer 讀到超過 limits.fileSize 就停下來（不會整個讀進記憶體），Nest 轉成 413；這裡換成契約的 errorCode
class Upload extends FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 }, defParamCharset: 'utf8' }) {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next)
    } catch (e) {
      if (e instanceof PayloadTooLargeException) throw new ApiError(413, 'FILE_TOO_LARGE', '檔案不能超過 5 MB')
      throw e
    }
  }
}

@ApiTags('files')
@ApiBearerAuth()
@ApiErrors(401, 403, 404)
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Permissions('files:write')
  @Post('projects/:id/files')
  @UseInterceptors(Upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiErrors(400, 413, 415)
  upload(@Param('id', UUID) projectId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new ApiError(400, 'VALIDATION_FAILED', '要用 multipart 的 file 欄位上傳')
    return this.files.upload(projectId, file)
  }

  @Permissions('files:read')
  @Get('files/:id')
  async get(@Param('id', UUID) id: string) {
    return fileView(await this.files.get(id))
  }

  // 一律下載（attachment）、Content-Type 用偵測出來的、nosniff：上傳的 HTML 不會在我們的網域被當成網頁執行（auth 課第 7 課）
  @Permissions('files:read')
  @Get('files/:id/content')
  async content(@Param('id', UUID) id: string, @Res({ passthrough: true }) res: Response) {
    const { file, data } = await this.files.content(id)
    res.set({ 'Content-Type': file.contentType, 'Content-Disposition': attachment(file.filename), 'X-Content-Type-Options': 'nosniff' })
    return new StreamableFile(data)
  }

  @Permissions('files:write')
  @Delete('files/:id')
  @HttpCode(204)
  remove(@Param('id', UUID) id: string) {
    return this.files.remove(id)
  }
}

@Module({ controllers: [FilesController], providers: [FilesService, StorageService], exports: [StorageService] })
export class FilesModule {}
