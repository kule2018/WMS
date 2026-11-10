import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { InventoryService, OrderKind } from './inventory.service';

const KINDS: OrderKind[] = ['move', 'adjust', 'freeze'];
function parseKind(k: string): OrderKind {
  if (!KINDS.includes(k as OrderKind)) throw new BadRequestException('单据类型仅支持 move / adjust / freeze');
  return k as OrderKind;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get('realtime') realtime(@Query('warehouseId') w?: string, @Query('goodsId') g?: string, @Query('keyword') k?: string) {
    return this.svc.realtime(w ? Number(w) : undefined, g ? Number(g) : undefined, k);
  }
  @Get('summary') summary(@Query('warehouseId') w?: string) { return this.svc.summary(w ? Number(w) : undefined); }
  @Get('logs') logs(@Query('goodsId') g?: string, @Query('bizNo') n?: string, @Query('limit') l?: string) {
    return this.svc.logs(g ? Number(g) : undefined, n, l ? Number(l) : 50);
  }
  @Get('warnings') warnings(@Query('warehouseId') w?: string) { return this.svc.warnings(w ? Number(w) : undefined); }
  @Get('warnings/overstock') overstock() { return this.svc.overstock(); }
  @Get('warnings/expiring') expiring(@Query('days') d?: string) { return this.svc.expiring(d ? Number(d) : 30); }

  /** 移库 / 调整 / 冻结三类作业单据：条件筛选 + 分页 */
  @Get('orders/:kind') listOrders(@Param('kind') kind: string, @Query() q: any) {
    return this.svc.listOrders(parseKind(kind), q);
  }
  @Get('orders/:kind/:id') detailOrder(@Param('kind') kind: string, @Param('id') id: string) {
    return this.svc.detailOrder(parseKind(kind), Number(id));
  }

  @Post('move') move(@Body() b: any, @Req() req: any) { return this.svc.move({ ...b, operator: req.user?.username || 'system' }); }
  @Post('adjust') adjust(@Body() b: any, @Req() req: any) { return this.svc.adjust({ ...b, operator: req.user?.username || 'system' }); }
  @Post('freeze') freeze(@Body() b: any, @Req() req: any) { return this.svc.freeze({ ...b, operator: req.user?.username || 'system' }); }
}
