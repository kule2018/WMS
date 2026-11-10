import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { query, queryOne, tx } from '../../common/db';
import { nextNo } from '../../common/seq';

/** 盘点单：草稿(0) → 盘点中(1) → 已完成(2)。字段名严格对齐 sql/wms.sql。 */
@Injectable()
export class CheckService {
  async list() {
    return query(`SELECT c.*, w.name AS warehouse_name,
        (SELECT COUNT(*) FROM wms_check_item i WHERE i.order_id = c.id) AS item_count
      FROM wms_check c LEFT JOIN wms_warehouse w ON w.id = c.warehouse_id ORDER BY c.id DESC`);
  }

  /** 新建盘点单，自动带出该仓库当前账面库存快照 */
  async create(d: { warehouseId: number; remark?: string; source?: string; operator: string }) {
    const no = await nextNo('PD', 'wms_check');
    const invs = await query('SELECT location_id, goods_id, batch_no, qty FROM wms_inventory WHERE warehouse_id=?', [d.warehouseId]);
    await tx(async (c) => {
      const [r] = await c.execute(
        'INSERT INTO wms_check (order_no,warehouse_id,status,source,remark,create_by) VALUES (?,?,0,?,?,?)',
        [no, d.warehouseId, d.source || 'MANUAL', d.remark || null, d.operator]);
      const checkId = (r as any).insertId;
      for (const i of invs) {
        await c.execute(
          'INSERT INTO wms_check_item (order_id,location_id,goods_id,batch_no,book_qty,real_qty,diff_qty) VALUES (?,?,?,?,?,NULL,0)',
          [checkId, i.location_id, i.goods_id, i.batch_no, i.qty]);
      }
    });
    return { orderNo: no, itemCount: invs.length };
  }

  async detail(id: number) {
    const order = await queryOne(`SELECT c.*, w.name AS warehouse_name FROM wms_check c
      LEFT JOIN wms_warehouse w ON w.id=c.warehouse_id WHERE c.id=?`, [id]);
    if (!order) throw new NotFoundException('盘点单不存在');
    const items = await query(
      `SELECT i.*, g.name AS goods_name, g.code AS goods_code, l.code AS location_code
       FROM wms_check_item i LEFT JOIN wms_goods g ON g.id=i.goods_id
       LEFT JOIN wms_location l ON l.id=i.location_id WHERE i.order_id=? ORDER BY i.id`, [id]);
    return { order, items };
  }

  /** 录入实盘数，同时计算差异量 */
  async record(id: number, items: { id: number; realQty: number }[]) {
    const o = await queryOne('SELECT status FROM wms_check WHERE id=?', [id]);
    if (!o) throw new NotFoundException('盘点单不存在');
    if (o.status === 2) throw new BadRequestException('盘点已完成，不可修改');
    for (const it of items) {
      const row: any = await queryOne('SELECT book_qty FROM wms_check_item WHERE id=? AND order_id=?', [it.id, id]);
      if (!row) continue;
      const real = Number(it.realQty);
      if (!Number.isFinite(real) || real < 0) throw new BadRequestException('实盘数量必须为非负数字');
      await query('UPDATE wms_check_item SET real_qty=?, diff_qty=? WHERE id=? AND order_id=?',
        [real, real - Number(row.book_qty), it.id, id]);
    }
    if (o.status === 0) await query('UPDATE wms_check SET status=1 WHERE id=?', [id]);
    return { success: true };
  }

  /** 完成盘点：盘盈盘亏在同一事务内改库存 + 生成调整单 + 写流水 */
  async finish(id: number, operator: string, autoAdjust = true) {
    const { order, items } = await this.detail(id);
    if (order.status === 2) throw new BadRequestException('盘点已完成');
    const adjustNos: string[] = [];
    for (const it of items) {
      if (it.real_qty === null || it.real_qty === undefined) continue;
      const diff = Number(it.real_qty) - Number(it.book_qty);
      if (diff === 0 || !autoAdjust) continue;
      const no = await nextNo('TZ', 'wms_adjust');
      await tx(async (c) => {
        const [inv] = await c.execute(
          'SELECT qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? FOR UPDATE',
          [order.warehouse_id, it.location_id, it.goods_id, it.batch_no]) as any;
        const before = inv[0] ? Number(inv[0].qty) : 0;
        if (before + diff < 0) throw new BadRequestException(`盘亏数量超过在库量：批次 ${it.batch_no}`);
        await c.execute(
          'UPDATE wms_inventory SET qty = qty + ? WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=?',
          [diff, order.warehouse_id, it.location_id, it.goods_id, it.batch_no]);
        await c.execute(
          `INSERT INTO wms_adjust (order_no,warehouse_id,location_id,goods_id,batch_no,real_qty,diff_qty,adjust_type,status,source,remark,audit_by,audit_time,create_by)
           VALUES (?,?,?,?,?,?,?,?,2,'CHECK',?,?,NOW(),?)`,
          [no, order.warehouse_id, it.location_id, it.goods_id, it.batch_no, it.real_qty, diff,
           diff > 0 ? 1 : 2, '盘点差异 ' + order.order_no, operator, operator]);
        await c.execute(
          'INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [diff > 0 ? 'CHECK_GAIN' : 'CHECK_LOSS', no, order.warehouse_id, it.location_id, it.goods_id,
           it.batch_no, diff, before, before + diff, operator]);
      });
      adjustNos.push(no);
    }
    await query('UPDATE wms_check SET status=2, audit_by=?, audit_time=NOW() WHERE id=?', [operator, id]);
    return { success: true, adjustNos, diffCount: adjustNos.length };
  }
}
