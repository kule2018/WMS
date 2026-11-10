import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { BasicService } from './basic.service';

@Controller('basic')
export class BasicController {
  constructor(private readonly svc: BasicService) {}

  /** 仓库 → 库区 → 库位 三级结构树 */
  @Get('structure/tree') structureTree() { return this.svc.structureTree(); }

  @Get('warehouse/list') listWarehouse() { return this.svc.listWarehouse(); }
  @Post('warehouse') createWarehouse(@Body() b: any) { return this.svc.createWarehouse(b); }
  @Put('warehouse/:id') updateWarehouse(@Param('id') id: string, @Body() b: any) { return this.svc.updateWarehouse(Number(id), b); }
  @Delete('warehouse/:id') removeWarehouse(@Param('id') id: string) { return this.svc.removeWarehouse(Number(id)); }

  @Get('area/list') listArea(@Query('warehouseId') w?: string) { return this.svc.listArea(w ? Number(w) : undefined); }
  @Post('area') createArea(@Body() b: any) { return this.svc.createArea(b); }
  @Put('area/:id') updateArea(@Param('id') id: string, @Body() b: any) { return this.svc.updateArea(Number(id), b); }
  @Delete('area/:id') removeArea(@Param('id') id: string) { return this.svc.removeArea(Number(id)); }

  @Get('location/list') listLocation(@Query('warehouseId') w?: string, @Query('areaId') a?: string) {
    return this.svc.listLocation(w ? Number(w) : undefined, a ? Number(a) : undefined);
  }
  @Post('location') createLocation(@Body() b: any) { return this.svc.createLocation(b); }
  @Put('location/:id') updateLocation(@Param('id') id: string, @Body() b: any) { return this.svc.updateLocation(Number(id), b); }
  @Delete('location/:id') removeLocation(@Param('id') id: string) { return this.svc.removeLocation(Number(id)); }

  @Get('category/list') listCategory() { return this.svc.listCategory(); }
  @Post('category') createCategory(@Body() b: any) { return this.svc.createCategory(b); }
  @Put('category/:id') updateCategory(@Param('id') id: string, @Body() b: any) { return this.svc.updateCategory(Number(id), b); }
  @Delete('category/:id') removeCategory(@Param('id') id: string) { return this.svc.removeCategory(Number(id)); }

  @Get('goods/list') listGoods(@Query('keyword') k?: string) { return this.svc.listGoods(k); }
  @Post('goods') createGoods(@Body() b: any) { return this.svc.createGoods(b); }
  @Put('goods/:id') updateGoods(@Param('id') id: string, @Body() b: any) { return this.svc.updateGoods(Number(id), b); }
  @Delete('goods/:id') removeGoods(@Param('id') id: string) { return this.svc.removeGoods(Number(id)); }

  @Get('partner/list') listPartner(@Query('type') t?: string) { return this.svc.listPartner(t ? Number(t) : undefined); }
  @Post('partner') createPartner(@Body() b: any) { return this.svc.createPartner(b); }
  @Put('partner/:id') updatePartner(@Param('id') id: string, @Body() b: any) { return this.svc.updatePartner(Number(id), b); }
  @Delete('partner/:id') removePartner(@Param('id') id: string) { return this.svc.removePartner(Number(id)); }
}
