import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

// 練習 2：全域的認證 guard。@Public() 放行；其他路由要有有效的 Bearer token，
// 再用 sub 查資料庫，把最新狀態放進 request.user
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    throw new Error('TODO：練習 2')
  }
}
