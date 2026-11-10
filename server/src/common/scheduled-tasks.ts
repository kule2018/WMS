import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { query } from './db';
import { InventoryService } from '../modules/inventory/inventory.service';

/** 每日 8:00 扫描低库存 / 超储 / 临期，快照落库到 wms_warning */
@Injectable()
export class ScheduledTasks {
  private readonly logger = new Logger(ScheduledTasks.name);
  constructor(private readonly inventory: InventoryService) {}

  @Cron('0 0 8 * * *')
  async scanAll() {
    await this.lowStockScan();
    await this.overstockScan();
    await this.expiringScan();
  }

  private async clearToday(type: number) {
    await query('DELETE FROM wms_warning WHERE warn_date = CURDATE() AND warn_type = ?', [type]);
  }

  async lowStockScan() {
    try {
      const rows: any[] = await this.inventory.warnings();
      await this.clearToday(1);
      for (const r of rows) {
        await query(`INSERT INTO wms_warning (warn_date,warn_type,goods_id,available,threshold,gap,level,content)
          VALUES (CURDATE(),1,?,?,?,?,?,?)`,
          [r.goods_id, r.available, r.min_stock, r.gap, r.level, `${r.goods_code} ${r.goods_name} 可用 ${r.available} ≤ 安全库存 ${r.min_stock}`]);
      }
      const serious = rows.filter((r) => r.level === '严重').length;
      this.logger.log(`低库存扫描：${rows.length} 个商品低于安全库存（严重 ${serious} 个），已写入 wms_warning`);
    } catch (e: any) {
      this.logger.error(`低库存扫描失败：${e.message}`);
    }
  }

  async overstockScan() {
    try {
      const rows: any[] = await this.inventory.overstock();
      await this.clearToday(2);
      for (const r of rows) {
        await query(`INSERT INTO wms_warning (warn_date,warn_type,goods_id,available,threshold,gap,level,content)
          VALUES (CURDATE(),2,?,?,?,?,?,?)`,
          [r.goods_id, r.available, r.max_stock, Number(r.available) - Number(r.max_stock), '预警',
           `${r.goods_code} ${r.goods_name} 可用 ${r.available} > 库存上限 ${r.max_stock}`]);
      }
      this.logger.log(`超储扫描：${rows.length} 个商品超出库存上限`);
    } catch (e: any) {
      this.logger.error(`超储扫描失败：${e.message}`);
    }
  }

  async expiringScan() {
    try {
      const rows: any[] = await this.inventory.expiring(30) as any[];
      await this.clearToday(3);
      const grouped = new Map<number, { code: string; name: string; min: number; qty: number }>();
      for (const r of rows) {
        const g: any = await query('SELECT id, code, name FROM wms_goods WHERE name=? LIMIT 1', [r.goods_name]);
        if (!g[0]) continue;
        const id = g[0].id;
        const prev = grouped.get(id) || { code: g[0].code, name: g[0].name, min: Number(r.remain_days), qty: 0 };
        prev.min = Math.min(prev.min, Number(r.remain_days));
        prev.qty += Number(r.qty);
        grouped.set(id, prev);
      }
      for (const [goodsId, v] of grouped) {
        await query(`INSERT INTO wms_warning (warn_date,warn_type,goods_id,available,threshold,gap,level,content)
          VALUES (CURDATE(),3,?,?,30,?,?,?)`,
          [goodsId, v.qty, Math.max(30 - v.min, 0), v.min <= 7 ? '严重' : '预警',
           `${v.code} ${v.name} 有 ${v.qty} 件将在 ${v.min} 天内到期`]);
      }
      this.logger.log(`临期扫描：${grouped.size} 个商品存在 30 天内到期批次`);
    } catch (e: any) {
      this.logger.error(`临期扫描失败：${e.message}`);
    }
  }
}
