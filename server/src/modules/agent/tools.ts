import { query, queryOne } from '../../common/db';
import { InventoryService } from '../inventory/inventory.service';

export const WAREHOUSE_TIME = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

/** 专家可调用的领域工具实现；返回摘要文本 + 结构化数据（供前端表格展示） */
export function buildTools(deps: { inventory: InventoryService }) {
  return {
    query_realtime_inventory: async (args: any) => {
      const rows = await deps.inventory.realtime(args.warehouseId ? Number(args.warehouseId) : undefined, undefined, args.keyword);
      return { summary: `共 ${rows.length} 条库存记录，在库 ${rows.reduce((s: number, r: any) => s + Number(r.onhand_qty), 0)} 件，可用 ${rows.reduce((s: number, r: any) => s + Number(r.available_qty), 0)} 件`, data: rows.slice(0, 50) };
    },
    query_inventory_summary: async (args: any) => {
      const r = await deps.inventory.summary(args.warehouseId ? Number(args.warehouseId) : undefined);
      return { summary: `在库 ${r.onhand} 件，冻结 ${r.frozen} 件，可用 ${r.available} 件（${r.records} 条记录，涉及 ${r.skus} 个 SKU）`, data: r };
    },
    query_inventory_log: async (args: any) => {
      const rows = await deps.inventory.logs(args.goodsId ? Number(args.goodsId) : undefined, args.bizNo, args.limit || 20);
      return { summary: `共查到 ${rows.length} 条库存流水`, data: rows };
    },
    query_warehouse_location: async () => {
      const rows = await query(`SELECT l.code, l.id, w.name warehouse_name, a.name area_name FROM wms_location l
        LEFT JOIN wms_warehouse w ON w.id=l.warehouse_id LEFT JOIN wms_area a ON a.id=l.area_id WHERE l.status=1 ORDER BY w.id, l.code`);
      return { summary: `共 ${rows.length} 个可用库位`, data: rows };
    },
    query_inbound_orders: async (args: any) => ({ data: await query('SELECT id, order_no, warehouse_id, status, total_qty, create_time FROM wms_inbound ORDER BY id DESC LIMIT ?', [Number(args.limit || 10)]) , summary: '入库单列表'}),
    query_outbound_orders: async (args: any) => ({ data: await query('SELECT id, order_no, warehouse_id, status, total_qty, create_time FROM wms_outbound ORDER BY id DESC LIMIT ?', [Number(args.limit || 10)]), summary: '出库单列表' }),
    query_move_orders: async () => ({ data: await query('SELECT * FROM wms_move ORDER BY id DESC LIMIT 10'), summary: '移库单列表' }),
    query_adjust_orders: async () => ({ data: await query('SELECT * FROM wms_adjust ORDER BY id DESC LIMIT 10'), summary: '调整单列表' }),
    query_check_orders: async () => ({ data: await query('SELECT * FROM wms_check ORDER BY id DESC LIMIT 10'), summary: '盘点单列表' }),
    query_freeze_orders: async () => ({ data: await query('SELECT * FROM wms_freeze_log ORDER BY id DESC LIMIT 10'), summary: '冻结记录列表' }),
    query_low_stock: async () => {
      const rows = await deps.inventory.warnings();
      return { summary: rows.length ? `${rows.length} 个商品低于安全库存` : '当前无低库存商品', data: rows };
    },
    query_overstock: async () => {
      const rows = await query<any[]>(`SELECT g.id goods_id, g.code goods_code, g.name goods_name, g.unit, g.max_stock,
        COALESCE(SUM(i.qty-i.locked_qty),0) available FROM wms_goods g LEFT JOIN wms_inventory i ON i.goods_id=g.id
        WHERE g.status=1 AND g.max_stock>0 GROUP BY g.id HAVING available > g.max_stock ORDER BY available DESC`);
      return { summary: rows.length ? `${rows.length} 个商品超储` : '当前无超储商品', data: rows };
    },
    query_expiring: async (args: any) => {
      const days = Number(args.days || 30);
      const rows = await query(`SELECT g.name goods_name, l.code location_code, i.batch_no, i.qty, i.expire_at,
        DATEDIFF(i.expire_at, CURDATE()) remain_days FROM wms_inventory i
        LEFT JOIN wms_goods g ON g.id=i.goods_id LEFT JOIN wms_location l ON l.id=i.location_id
        WHERE i.expire_at IS NOT NULL AND i.expire_at <= DATE_ADD(CURDATE(), INTERVAL ? DAY) ORDER BY i.expire_at`, [days]);
      return { summary: rows.length ? `${rows.length} 条临期库存` : `未来 ${days} 天无临期库存`, data: rows };
    },
    query_stats_trend: async (args: any) => ({ data: await query(`SELECT DATE(o.audit_time) dt, SUM(it.qty) qty FROM ${args.type === 'outbound' ? 'wms_outbound' : 'wms_inbound'} o JOIN ${args.type === 'outbound' ? 'wms_outbound_item' : 'wms_inbound_item'} it ON it.order_id=o.id WHERE o.status=2 AND o.audit_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(o.audit_time) ORDER BY dt`, [Number(args.days || 7)]), summary: '出入库趋势' }),
    query_stats_structure: async () => {
      const rows = await query(`SELECT g.name goods_name, SUM(i.qty) qty, SUM(i.qty-i.locked_qty) available FROM wms_inventory i LEFT JOIN wms_goods g ON g.id=i.goods_id GROUP BY g.id ORDER BY qty DESC`);
      const statusRows = await query(`SELECT 'inbound' biz, status, COUNT(*) c FROM wms_inbound GROUP BY status
        UNION ALL SELECT 'outbound' biz, status, COUNT(*) c FROM wms_outbound GROUP BY status`);
      return { summary: '库存结构与单据状态分布', data: { structure: rows, orderStatus: statusRows } };
    },
    search_goods: async (args: any) => {
      const rows = await query('SELECT id, code, name, unit, min_stock FROM wms_goods WHERE status=1 AND (name LIKE ? OR code LIKE ?) LIMIT 10', [`%${args.keyword || ''}%`, `%${args.keyword || ''}%`]);
      return { summary: `匹配到 ${rows.length} 个商品`, data: rows };
    },
    search_partner: async (args: any) => {
      const rows = await query('SELECT id, type, code, name FROM wms_partner WHERE status=1 AND (name LIKE ? OR code LIKE ?) LIMIT 10', [`%${args.keyword || ''}%`, `%${args.keyword || ''}%`]);
      return { summary: `匹配到 ${rows.length} 个往来单位（type 1=供应商 2=客户）`, data: rows };
    },
  };
}

export type ToolName = keyof ReturnType<typeof buildTools>;
export const TOOL_NAMES = Object.keys({
  query_realtime_inventory: 1, query_inventory_summary: 1, query_inventory_log: 1, query_warehouse_location: 1,
  query_inbound_orders: 1, query_outbound_orders: 1, query_move_orders: 1, query_adjust_orders: 1, query_check_orders: 1, query_freeze_orders: 1,
  query_low_stock: 1, query_overstock: 1, query_expiring: 1, query_stats_trend: 1, query_stats_structure: 1, search_goods: 1, search_partner: 1,
});
