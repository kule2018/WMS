import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CheckService } from './check.service';

@Controller('check')
export class CheckController {
  constructor(private readonly svc: CheckService) {}

  @Get('list') list() { return this.svc.list(); }
  @Get(':id') detail(@Param('id') id: string) { return this.svc.detail(Number(id)); }
  @Post() create(@Body() b: any, @Req() req: any) { return this.svc.create({ ...b, operator: req.user?.username || 'system' }); }
  @Post(':id/record') record(@Param('id') id: string, @Body() b: any) { return this.svc.record(Number(id), b.items || []); }
  @Post(':id/finish') finish(@Param('id') id: string, @Req() req: any) { return this.svc.finish(Number(id), req.user?.username || 'system'); }
}
