import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body.username, body.password);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('authorization') auth: string) {
    await this.auth.logout((auth || '').replace(/^Bearer\s+/i, ''));
    return { success: true };
  }

  /** 刷新时拿当前用户信息 + 动态菜单 */
  @Get('profile')
  async profile(@Req() req: any) {
    return this.auth.profile(req.user.id);
  }
}
