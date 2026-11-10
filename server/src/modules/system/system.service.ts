import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { query } from '../../common/db';

/** 系统管理：用户 / 角色 / 菜单。字段名严格对齐 sql/wms.sql。 */
@Injectable()
export class SystemService {
  listUsers() {
    return query(`SELECT u.id, u.username, u.nickname, u.role_id, r.role_name, r.role_key, u.status, u.create_time
      FROM sys_user u LEFT JOIN sys_role r ON r.id = u.role_id ORDER BY u.id`);
  }

  listRoles() {
    return query('SELECT id, role_name, role_name AS name, role_key, menu_ids, remark FROM sys_role ORDER BY id');
  }

  listMenus() {
    return query(`SELECT id, parent_id, name, path, component, icon, sort, menu_type, menu_type AS type, perms, status
      FROM sys_menu ORDER BY sort, id`);
  }

  async createUser(d: any) {
    const hash = await bcrypt.hash(d.password || '123456', 10);
    return query('INSERT INTO sys_user (username,password,nickname,role_id,status) VALUES (?,?,?,?,1)',
      [d.username, hash, d.nickname || d.realName || null, d.roleId || null]);
  }

  deleteUser(id: number) {
    if (id === 1) throw new Error('不能删除管理员账号');
    return query('DELETE FROM sys_user WHERE id=?', [id]);
  }

  resetPwd(id: number, pwd: string) {
    return bcrypt.hash(pwd, 10).then((h) => query('UPDATE sys_user SET password=? WHERE id=?', [h, id]));
  }

  setStatus(id: number, status: number) {
    return query('UPDATE sys_user SET status=? WHERE id=?', [status, id]);
  }

  /** 当前数据模型为单角色（sys_user.role_id），取第一个角色 */
  assignRoles(userId: number, roleIds: number[]) {
    return query('UPDATE sys_user SET role_id=? WHERE id=?', [roleIds?.[0] || null, userId]);
  }

  saveRole(r: any) {
    const name = r.roleName || r.name;
    const key = r.roleKey || r.key;
    const menus = r.menuIds || '';
    const remark = r.remark || null;
    if (r.id) return query('UPDATE sys_role SET role_name=?, role_key=?, menu_ids=?, remark=? WHERE id=?', [name, key, menus, remark, r.id]);
    return query('INSERT INTO sys_role (role_name, role_key, menu_ids, remark) VALUES (?,?,?,?)', [name, key, menus, remark]);
  }

  deleteRole(id: number) {
    return query('DELETE FROM sys_role WHERE id=?', [id]);
  }

  saveMenu(m: any) {
    const args = [
      m.name, m.path || null, m.component || null, m.icon || null,
      m.parentId ?? m.parent_id ?? 0, m.sort || 0,
      m.menuType ?? m.menu_type ?? 1, m.perms || null, m.status ?? 1,
    ];
    if (m.id) {
      return query(`UPDATE sys_menu SET name=?,path=?,component=?,icon=?,parent_id=?,sort=?,menu_type=?,perms=?,status=? WHERE id=?`,
        [...args, m.id]);
    }
    return query(`INSERT INTO sys_menu (name,path,component,icon,parent_id,sort,menu_type,perms,status) VALUES (?,?,?,?,?,?,?,?,?)`, args);
  }

  deleteMenu(id: number) {
    return query('DELETE FROM sys_menu WHERE id=?', [id]);
  }
}
