import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly svc: SystemService) {}

  @Get('user/list') listUsers() { return this.svc.listUsers(); }
  @Post('user') createUser(@Body() b: any) { return this.svc.createUser(b); }
  @Put('user/:id/status') setStatus(@Param('id') id: string, @Body() b: any) { return this.svc.setStatus(Number(id), Number(b.status)); }
  @Put('user/:id/password') resetPwd(@Param('id') id: string, @Body() b: any) { return this.svc.resetPwd(Number(id), b.password || '123456'); }
  @Put('user/:id/roles') assignRoles(@Param('id') id: string, @Body() b: any) { return this.svc.assignRoles(Number(id), b.roleIds || []); }
  @Delete('user/:id') deleteUser(@Param('id') id: string) { return this.svc.deleteUser(Number(id)); }

  @Get('role/list') listRoles() { return this.svc.listRoles(); }
  @Post('role') createRole(@Body() b: any) { return this.svc.saveRole(b); }
  @Put('role/:id') updateRole(@Param('id') id: string, @Body() b: any) { return this.svc.saveRole({ ...b, id: Number(id) }); }
  @Delete('role/:id') deleteRole(@Param('id') id: string) { return this.svc.deleteRole(Number(id)); }

  @Get('menu/list') listMenus() { return this.svc.listMenus(); }
  @Post('menu') createMenu(@Body() b: any) { return this.svc.saveMenu(b); }
  @Put('menu/:id') updateMenu(@Param('id') id: string, @Body() b: any) { return this.svc.saveMenu({ ...b, id: Number(id) }); }
  @Delete('menu/:id') deleteMenu(@Param('id') id: string) { return this.svc.deleteMenu(Number(id)); }
}
