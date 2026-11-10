import { Injectable } from '@nestjs/common';
import { query, queryOne } from '../../common/db';

@Injectable()
export class DashboardService {
  async overview() {
    const inv = await queryOne<any>('SELECT COALESCE(SUM(qty),0) onhand, COALESCE(SUM(locked_qty),0) frozen, COALESCE(SUM(qty-locked_qty),0) available, COUNT(DISTINCT goods_id) skus FROM wms_inventory');
    const todo = await queryOne<any>(`SELECT
        (SELECT COUNT(*) FROM wms_inbound WHERE status=1) inbound,
        (SELECT COUNT(*) FROM wms_outbound WHERE status=1) outbound,
        (SELECT COUNT(*) FROM wms_check WHERE status IN (0,1)) checkCnt`);
    // MySQL 8 严格模式下 HAVING 只能引用出现在 SELECT/GROUP BY 的列，需显式带上 min_stock
    const warn = await queryOne<any>('SELECT COUNT(*) c FROM (SELECT g.id, g.min_stock FROM wms_goods g LEFT JOIN wms_inventory i ON i.goods_id=g.id WHERE g.status=1 AND g.min_stock>0 GROUP BY g.id, g.min_stock HAVING COALESCE(SUM(i.qty-i.locked_qty),0) <= g.min_stock) t');
    return {
      inventory: { onhand: Number(inv.onhand), frozen: Number(inv.frozen), available: Number(inv.available), skus: Number(inv.skus) },
      todo: { inbound: Number(todo.inbound), outbound: Number(todo.outbound), check: Number(todo.checkCnt) },
      warningCount: Number(warn?.c || 0),
    };
  }

  async trend(days = 7) {
    const rows = await query(`SELECT d.dt,
        COALESCE((SELECT SUM(i.qty) FROM wms_inbound o JOIN wms_inbound_item i ON i.order_id=o.id WHERE o.status=2 AND DATE(o.audit_time)=d.dt),0) inbound,
        COALESCE((SELECT SUM(i.qty) FROM wms_outbound o JOIN wms_outbound_item i ON i.order_id=o.id WHERE o.status=2 AND DATE(o.audit_time)=d.dt),0) outbound
      FROM (SELECT DATE_SUB(CURDATE(), INTERVAL n DAY) dt FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) nums WHERE n < ?) d ORDER BY d.dt`, [Number(days)]);
    return rows.map((r: any) => ({ ...r, inbound: Number(r.inbound), outbound: Number(r.outbound) }));
  }
}
