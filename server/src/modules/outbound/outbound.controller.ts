import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { OutboundService } from './outbound.service';

@Controller('outbound')
export class OutboundController {
  constructor(private readonly svc: OutboundService) {}

  @Get('list') list(@Query() q: any) { return this.svc.list(q); }
  @Get(':id') detail(@Param('id') id: string) { return this.svc.detail(Number(id)); }
  @Post() create(@Body() b: any, @Req() req: any) {
    return this.svc.create({ ...b, createBy: req.user?.username || 'system' });
  }
  @Put(':id') update(@Param('id') id: string, @Body() b: any) { return this.svc.update(Number(id), b); }
  @Post(':id/submit') submit(@Param('id') id: string) { return this.svc.submit(Number(id)); }
  @Post(':id/audit') audit(@Param('id') id: string, @Req() req: any) { return this.svc.audit(Number(id), req.user?.username || 'system'); }
  @Delete(':id/draft') remove(@Param('id') id: string) { return this.svc.remove(Number(id)); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.svc.cancel(Number(id)); }
}
