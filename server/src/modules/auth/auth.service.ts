import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { query, queryOne } from '../../common/db';

interface UserRow {
  id: number; username: string; password: string; nickname: string; role_id: number; status: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(username: string, password: string) {
    const u = await queryOne<UserRow>('SELECT * FROM sys_user WHERE username = ?', [username]);
    if (!u || u.status !== 1) throw new UnauthorizedException('账号不存在或已停用');
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) throw new UnauthorizedException('密码错误');
    const token = await this.jwt.signAsync({ sub: u.id, username: u.username });
    const menus = await this.menusOf(u.id);
    return { token, userInfo: { id: u.id, username: u.username, nickname: u.nickname, roleId: u.role_id }, menus };
  }

  async logout(token: string) {
    if (!token) return;
    let exp = 0;
    try {
      const d: any = this.jwt.decode(token);
      exp = d?.exp ? d.exp * 1000 : Date.now() + 864e5;
    } catch { exp = Date.now() + 864e5; }
    await query('INSERT IGNORE INTO sys_token_blacklist (token, expire_at) VALUES (?, ?)', [token, new Date(exp)]);
  }

  /** 登录态校验：黑名单优先 */
  async verify(token: string) {
    if (!token) return null;
    const hit = await queryOne('SELECT token FROM sys_token_blacklist WHERE token = ?', [token]);
    if (hit) return null;
    try {
      const payload = await this.jwt.verifyAsync(token);
      return { id: payload.sub, username: payload.username };
    } catch {
      return null;
    }
  }

  /** 菜单按角色动态下发：管理员全量，其余取角色 menu_ids */
  async menusOf(userId: number) {
    const u = await queryOne<UserRow>('SELECT role_id FROM sys_user WHERE id = ?', [userId]);
    if (!u) return [];
    const role = await queryOne<{ role_key: string; menu_ids: string }>('SELECT role_key, menu_ids FROM sys_role WHERE id = ?', [u.role_id]);
    const all = await query('SELECT id, parent_id, name, path, component, icon, sort, menu_type, perms FROM sys_menu WHERE status = 1 ORDER BY sort');
    if (role?.role_key === 'admin') return all;
    const ids = new Set((role?.menu_ids || '').split(',').map(Number).filter(Boolean));
    return all.filter((m: any) => ids.has(m.id));
  }

  async profile(userId: number) {
    const u = await queryOne<UserRow>('SELECT id, username, nickname, role_id, status FROM sys_user WHERE id = ?', [userId]);
    if (!u) return null;
    const menus = await this.menusOf(userId);
    return { userInfo: { id: u.id, username: u.username, nickname: u.nickname, roleId: u.role_id }, menus };
  }
}
