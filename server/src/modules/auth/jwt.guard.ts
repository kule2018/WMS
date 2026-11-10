import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';

export const IS_PUBLIC = 'is_public';
export const Public = () => (target: any, key?: any, desc?: any) => {
  const fn = desc ? desc.value : target;
  Reflect.defineMetadata(IS_PUBLIC, true, fn);
  return desc || target;
};

/** 全局守卫：校验 JWT + 黑名单退出机制；白名单接口用 @Public() */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: any }>();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.query?.token as string);
    const user = token ? await this.auth.verify(token) : null;
    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException('登录态失效，请重新登录');
    }
    req.user = { ...user, token };
    return true;
  }
}
