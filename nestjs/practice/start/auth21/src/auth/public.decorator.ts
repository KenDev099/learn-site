// 練習 2：@Public() 在 handler 或 class 上貼一個「公開」的標籤，JwtAuthGuard 看到就放行
export const IS_PUBLIC_KEY = 'isPublic'

// TODO：用 SetMetadata 寫出來。現在是什麼都不做的裝飾器
export const Public = (): MethodDecorator & ClassDecorator => () => {}
