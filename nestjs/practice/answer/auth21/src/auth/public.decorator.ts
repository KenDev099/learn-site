import { SetMetadata } from '@nestjs/common'

// 練習 2：@Public() 在 handler 或 class 上貼一個「公開」的標籤，JwtAuthGuard 看到就放行
export const IS_PUBLIC_KEY = 'isPublic'

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
