import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { query, queryOne, tx } from '../../common/db';
import { nextNo } from '../../common/seq';

export type OrderKind = 'move' | 'adjust' | 'freeze';

/** 库存作业：实时库存 / 流水 / 移库 / 调整 / 冻结解冻 / 预警 / 作业单据查询 */
@Injectable()
export class InventoryService {
  /** 实时库存：在库/冻结/可用，可用 = qty - locked_qty */
  async realtime(warehouseId?: number, goodsId?: number, keyword?: string) {
    if (keyword && !goodsId) {
      const g = await queryOne<any>('SELECT id FROM wms_goods WHERE code=? OR name LIKE ? LIMIT 1', [keyword, `%${keyword}%`]);
      if (g) goodsId = g.id;
    }
    let sql = `SELECT i.id AS stock_id, i.warehouse_id, w.name AS warehouse_name, i.location_id, l.code AS location_code,
                      i.goods_id, g.code AS goods_code, g.name AS goods_name, g.spec, g.unit,
                      c.name AS category_name, g.min_stock, g.max_stock,
                      i.batch_no, i.qty AS onhand_qty, i.locked_qty AS frozen_qty, (i.qty - i.locked_qty) AS available_qty,
                      i.expire_at, i.update_time
               FROM wms_inventory i
               LEFT JOIN wms_warehouse w ON w.id=i.warehouse_id
               LEFT JOIN wms_location l ON l.id=i.location_id
               LEFT JOIN wms_goods g ON g.id=i.goods_id
               LEFT JOIN wms_category c ON c.id=g.category_id WHERE 1=1`;
    const p: any[] = [];
    if (warehouseId) { sql += ' AND i.warehouse_id=?'; p.push(warehouseId); }
    if (goodsId) { sql += ' AND i.goods_id=?'; p.push(goodsId); }
    if (keyword && !goodsId) { sql += ' AND (g.code LIKE ? OR g.name LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY i.warehouse_id, l.code, g.code';
    return query(sql, p);
  }

  async summary(warehouseId?: number) {
    const r = await queryOne<any>(`SELECT COALESCE(SUM(qty),0) AS onhand, COALESCE(SUM(locked_qty),0) AS frozen,
             COALESCE(SUM(qty-locked_qty),0) AS available, COUNT(DISTINCT goods_id) AS skus,
             COUNT(*) AS records FROM wms_inventory ${warehouseId ? 'WHERE warehouse_id=?' : ''}`, warehouseId ? [warehouseId] : []);
    return { ...r, onhand: Number(r.onhand), frozen: Number(r.frozen), available: Number(r.available) };
  }

  async logs(goodsId?: number, bizNo?: string, limit = 50) {
    let sql = `SELECT h.*, g.name AS goods_name, g.code AS goods_code, l.code AS location_code, w.name AS warehouse_name
               FROM wms_inventory_log h
               LEFT JOIN wms_goods g ON g.id=h.goods_id
               LEFT JOIN wms_location l ON l.id=h.location_id
               LEFT JOIN wms_warehouse w ON w.id=h.warehouse_id WHERE 1=1`;
    const p: any[] = [];
    if (goodsId) { sql += ' AND h.goods_id=?'; p.push(goodsId); }
    if (bizNo) { sql += ' AND h.biz_no=?'; p.push(bizNo); }
    sql += ' ORDER BY h.id DESC LIMIT ?'; p.push(Number(limit));
    return query(sql, p);
  }

  /** 移库：同一仓库内库位调拨，事务保证库存/流水/单据同步 */
  async move(d: { fromLocationId: number; toLocationId: number; goodsId: number; batchNo?: string; qty: number; remark?: string; operator: string }) {
    const qty = Number(d.qty);
    if (qty <= 0) throw new BadRequestException('移库数量必须大于 0');
    if (d.fromLocationId === d.toLocationId) throw new BadRequestException('源库位与目标库位不能相同');
    const batch = d.batchNo || 'DEFAULT';
    const no = await nextNo('YD', 'wms_move');
    await tx(async (c) => {
      const [srcRows]: any = await c.execute(
        'SELECT id, warehouse_id, qty, locked_qty FROM wms_inventory WHERE location_id=? AND goods_id=? AND batch_no=? FOR UPDATE',
        [d.fromLocationId, d.goodsId, batch]);
      const src = srcRows[0];
      if (!src) throw new BadRequestException('源库位无该库存');
      if (Number(src.qty) - Number(src.locked_qty) < qty) throw new BadRequestException('源库位可用库存不足');
      const wh = src.warehouse_id;
      await c.execute('UPDATE wms_inventory SET qty=qty-? WHERE id=?', [qty, src.id]);
      await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ['MOVE_OUT', no, wh, d.fromLocationId, d.goodsId, batch, -qty, Number(src.qty), Number(src.qty) - qty, d.operator]);
      const [dstRows]: any = await c.execute(
        'SELECT id, qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? FOR UPDATE',
        [wh, d.toLocationId, d.goodsId, batch]);
      const before = dstRows[0] ? Number(dstRows[0].qty) : 0;
      if (dstRows[0]) await c.execute('UPDATE wms_inventory SET qty=qty+? WHERE id=?', [qty, dstRows[0].id]);
      else await c.execute('INSERT INTO wms_inventory (warehouse_id,location_id,goods_id,batch_no,qty,locked_qty) VALUES (?,?,?,?,?,0)',
        [wh, d.toLocationId, d.goodsId, batch, qty]);
      await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ['MOVE_IN', no, wh, d.toLocationId, d.goodsId, batch, qty, before, before + qty, d.operator]);
      await c.execute(`INSERT INTO wms_move (order_no,warehouse_id,goods_id,batch_no,from_location_id,to_location_id,qty,status,source,remark,create_by,audit_time)
        VALUES (?,?,?,?,?,?,?,2,?,?,?,NOW())`,
        [no, wh, d.goodsId, batch, d.fromLocationId, d.toLocationId, qty, 'MANUAL', d.remark || null, d.operator]);
    });
    return { orderNo: no };
  }

  /** 库存调整：盘盈(1)/盘亏(2) 修正 */
  async adjust(d: { warehouseId: number; locationId: number; goodsId: number; batchNo?: string; actualQty: number; type: 1 | 2; reason?: string; operator: string }) {
    const qty = Number(d.actualQty);
    if (qty <= 0) throw new BadRequestException('调整数量必须大于 0');
    const batch = d.batchNo || 'DEFAULT';
    const no = await nextNo('TZ', 'wms_adjust');
    await tx(async (c) => {
      const [rows]: any = await c.execute(
        'SELECT id, qty, locked_qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? FOR UPDATE',
        [d.warehouseId, d.locationId, d.goodsId, batch]);
      const row = rows[0];
      const before = row ? Number(row.qty) : 0;
      const diff = d.type === 1 ? qty : -qty;
      if (before + diff < 0) throw new BadRequestException('调整后在库量不能为负');
      if (d.type === 2 && before - Number(row?.locked_qty || 0) < qty) throw new BadRequestException('冻结库存不可盘亏');
      if (row) await c.execute('UPDATE wms_inventory SET qty=qty+? WHERE id=?', [diff, row.id]);
      else await c.execute('INSERT INTO wms_inventory (warehouse_id,location_id,goods_id,batch_no,qty,locked_qty) VALUES (?,?,?,?,?,0)',
        [d.warehouseId, d.locationId, d.goodsId, batch, diff]);
      await c.execute(`INSERT INTO wms_adjust (order_no,warehouse_id,location_id,goods_id,batch_no,real_qty,diff_qty,adjust_type,status,source,remark,create_by,audit_time)
        VALUES (?,?,?,?,?,?,?,?,2,?,?,?,NOW())`,
        [no, d.warehouseId, d.locationId, d.goodsId, batch, before + diff, diff, d.type, 'MANUAL', d.reason || null, d.operator]);
      await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [d.type === 1 ? 'ADJ_IN' : 'ADJ_OUT', no, d.warehouseId, d.locationId, d.goodsId, batch, diff, before, before + diff, d.operator]);
    });
    return { orderNo: no };
  }

  /** 冻结/解冻：在库量与可用量分离，全流程事务 + 主单/流水同步 */
  async freeze(d: { warehouseId: number; locationId: number; goodsId: number; batchNo?: string; qty: number; type: 1 | 2; reason?: string; operator: string }) {
    const batch = d.batchNo || 'DEFAULT';
    const qty = Number(d.qty);
    if (qty <= 0) throw new BadRequestException('数量必须大于 0');
    const no = await nextNo('DJ', 'wms_freeze');
    await tx(async (c) => {
      const [rows]: any = await c.execute(
        'SELECT id, qty, locked_qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? FOR UPDATE',
        [d.warehouseId, d.locationId, d.goodsId, batch]);
      const row = rows[0];
      if (!row) throw new BadRequestException('无该库存记录');
      const locked = Number(row.locked_qty);
      if (d.type === 1 && Number(row.qty) - locked < qty) throw new BadRequestException('可冻结量不足');
      if (d.type === 2 && locked < qty) throw new BadRequestException('冻结量不足');
      const delta = d.type === 1 ? qty : -qty;
      await c.execute('UPDATE wms_inventory SET locked_qty = locked_qty + ? WHERE id=?', [delta, row.id]);
      await c.execute(`INSERT INTO wms_freeze (order_no,warehouse_id,location_id,goods_id,batch_no,qty,action,status,source,remark,audit_by,audit_time,create_by)
        VALUES (?,?,?,?,?,?,?,2,?,?,?,NOW(),?)`,
        [no, d.warehouseId, d.locationId, d.goodsId, batch, qty, d.type, 'MANUAL', d.reason || null, d.operator, d.operator]);
      await c.execute('INSERT INTO wms_freeze_log (order_no,type,warehouse_id,location_id,goods_id,batch_no,qty,reason,operator) VALUES (?,?,?,?,?,?,?,?,?)',
        [no, d.type, d.warehouseId, d.locationId, d.goodsId, batch, qty, d.reason || null, d.operator]);
      await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [d.type === 1 ? 'FREEZE' : 'UNFREEZE', no, d.warehouseId, d.locationId, d.goodsId, batch, 0, locked, locked + delta, d.operator]);
    });
    return { orderNo: no };
  }

  /** 移库/调整/冻结三类作业单据的通用条件查询 */
  async listOrders(kind: OrderKind, p: any = {}) {
    const table = kind === 'move' ? 'wms_move' : kind === 'adjust' ? 'wms_adjust' : 'wms_freeze';
    const where: string[] = [];
    const args: any[] = [];
    if (p.orderNo) { where.push('o.order_no LIKE ?'); args.push(`%${p.orderNo}%`); }
    if (p.status !== undefined && p.status !== null && p.status !== '') { where.push('o.status = ?'); args.push(Number(p.status)); }
    if (p.warehouseId) { where.push('o.warehouse_id = ?'); args.push(Number(p.warehouseId)); }
    if (p.goodsId) { where.push('o.goods_id = ?'); args.push(Number(p.goodsId)); }
    if (p.dateFrom) { where.push('o.create_time >= ?'); args.push(`${p.dateFrom} 00:00:00`); }
    if (p.dateTo) { where.push('o.create_time <= ?'); args.push(`${p.dateTo} 23:59:59`); }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = await queryOne<any>(`SELECT COUNT(*) c FROM ${table} o ${clause}`, args);
    const page = Math.max(1, Number(p.page || 1));
    const size = Math.min(200, Math.max(1, Number(p.size || 20)));
    const loc = kind === 'move' ? 'o.from_location_id' : 'o.location_id';
    const toLoc = kind === 'move' ? ', l2.code AS to_location_code' : ', NULL AS to_location_code';
    const toJoin = kind === 'move' ? 'LEFT JOIN wms_location l2 ON l2.id=o.to_location_id' : '';
    const rows = await query(`SELECT o.*, w.name AS warehouse_name, g.name AS goods_name, g.code AS goods_code,
        l.code AS location_code${toLoc}
      FROM ${table} o
      LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id
      LEFT JOIN wms_goods g ON g.id=o.goods_id
      LEFT JOIN wms_location l ON l.id=${loc}
      ${toJoin}
      ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    return { rows, total: Number(total?.c || 0), page, size };
  }

  async detailOrder(kind: OrderKind, id: number) {
    const table = kind === 'move' ? 'wms_move' : kind === 'adjust' ? 'wms_adjust' : 'wms_freeze';
    const loc = kind === 'move' ? 'o.from_location_id' : 'o.location_id';
    const toLoc = kind === 'move' ? ', l2.code AS to_location_code' : ', NULL AS to_location_code';
    const toJoin = kind === 'move' ? 'LEFT JOIN wms_location l2 ON l2.id=o.to_location_id' : '';
    const order = await queryOne(`SELECT o.*, w.name AS warehouse_name, g.name AS goods_name, g.code AS goods_code,
        l.code AS location_code${toLoc}
      FROM ${table} o
      LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id
      LEFT JOIN wms_goods g ON g.id=o.goods_id
      LEFT JOIN wms_location l ON l.id=${loc}
      ${toJoin} WHERE o.id=?`, [id]);
    if (!order) throw new NotFoundException('单据不存在');
    return { order };
  }

  /** 低库存预警：按商品安全库存对照可用量 */
  async warnings(warehouseId?: number) {
    const rows = await query<any>(`SELECT g.id AS goods_id, g.code AS goods_code, g.name AS goods_name,
        g.spec, g.unit, ANY_VALUE(c.name) AS category_name, g.min_stock, g.max_stock,
        COALESCE(SUM(i.qty),0) AS onhand, COALESCE(SUM(i.locked_qty),0) AS frozen, COALESCE(SUM(i.qty-i.locked_qty),0) AS available
      FROM wms_goods g
      LEFT JOIN wms_inventory i ON i.goods_id = g.id ${warehouseId ? 'AND i.warehouse_id=?' : ''}
      LEFT JOIN wms_category c ON c.id = g.category_id
      WHERE g.status=1 AND g.min_stock > 0 GROUP BY g.id`, warehouseId ? [warehouseId] : []);
    const all = rows.map((r) => ({
      ...r, onhand: Number(r.onhand), frozen: Number(r.frozen), available: Number(r.available),
      gap: Math.max(Number(r.min_stock) - Number(r.available), 0),
    }));
    return all
      .filter((r) => r.available <= r.min_stock)
      .map((r) => ({ ...r, level: r.available <= r.min_stock * 0.5 ? '严重' : '预警' }))
      .sort((a, b) => a.available - b.available);
  }

  /** 超储预警 */
  async overstock() {
    return query<any>(`SELECT g.id AS goods_id, g.code AS goods_code, g.name AS goods_name,
        g.spec, g.unit, ANY_VALUE(c.name) AS category_name, g.min_stock, g.max_stock,
        COALESCE(SUM(i.qty),0) AS onhand, COALESCE(SUM(i.qty-i.locked_qty),0) AS available
      FROM wms_goods g
      LEFT JOIN wms_inventory i ON i.goods_id=g.id
      LEFT JOIN wms_category c ON c.id=g.category_id
      WHERE g.status=1 AND g.max_stock>0 GROUP BY g.id HAVING available > g.max_stock ORDER BY available DESC`);
  }

  /** 临期预警 */
  async expiring(days = 30) {
    return query<any>(`SELECT g.name AS goods_name, g.code AS goods_code, g.spec, g.unit,
        c.name AS category_name, l.code AS location_code, i.batch_no, i.qty, i.expire_at,
        DATEDIFF(i.expire_at, CURDATE()) remain_days FROM wms_inventory i
      LEFT JOIN wms_goods g ON g.id=i.goods_id
      LEFT JOIN wms_category c ON c.id=g.category_id
      LEFT JOIN wms_location l ON l.id=i.location_id
      WHERE i.expire_at IS NOT NULL AND i.expire_at <= DATE_ADD(CURDATE(), INTERVAL ? DAY) ORDER BY i.expire_at`, [Number(days)]);
  }
}
