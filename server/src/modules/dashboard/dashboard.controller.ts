import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('overview') overview() { return this.svc.overview(); }
  @Get('trend') trend(@Query('days') d?: string) { return this.svc.trend(d ? Number(d) : 7); }
}
