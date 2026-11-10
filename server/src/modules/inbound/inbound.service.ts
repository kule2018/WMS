import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolConnection } from 'mysql2/promise';
import { query, queryOne, tx } from '../../common/db';
import { nextNo } from '../../common/seq';

export interface ItemDTO { goodsId: number; locationId: number; batchNo?: string; qty: number; price?: number; productionAt?: string; expireAt?: string }
export interface OrderQuery {
  status?: number | string; page?: number | string; size?: number | string;
  orderNo?: string; orderType?: string; warehouseId?: number | string;
  partnerId?: number | string; dateFrom?: string; dateTo?: string;
}

/** 入库单：草稿(0) → 待审核(1) → 已入库(2)；审核瞬间事务写入库存 + 流水 */
@Injectable()
export class InboundService {
  async list(p: OrderQuery = {}) {
    const where: string[] = [];
    const args: any[] = [];
    if (p.status !== undefined && p.status !== null && p.status !== '') { where.push('o.status = ?'); args.push(Number(p.status)); }
    if (p.orderNo) { where.push('o.order_no LIKE ?'); args.push(`%${p.orderNo}%`); }
    if (p.orderType) { where.push('o.order_type = ?'); args.push(p.orderType); }
    if (p.warehouseId) { where.push('o.warehouse_id = ?'); args.push(Number(p.warehouseId)); }
    if (p.partnerId) { where.push('o.partner_id = ?'); args.push(Number(p.partnerId)); }
    if (p.dateFrom) { where.push('o.create_time >= ?'); args.push(`${p.dateFrom} 00:00:00`); }
    if (p.dateTo) { where.push('o.create_time <= ?'); args.push(`${p.dateTo} 23:59:59`); }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = await queryOne<any>(`SELECT COUNT(*) c FROM wms_inbound o ${clause}`, args);
    const page = Math.max(1, Number(p.page || 1));
    const size = Math.min(200, Math.max(1, Number(p.size || 20)));
    const rows = await query(
      `SELECT o.*, w.name AS warehouse_name, pt.name AS partner_name FROM wms_inbound o
       LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id LEFT JOIN wms_partner pt ON pt.id=o.partner_id
       ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    return { rows, total: Number(total?.c || 0), page, size };
  }

  async detail(id: number) {
    const order = await queryOne(`SELECT o.*, w.name AS warehouse_name, pt.name AS partner_name
      FROM wms_inbound o LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id
      LEFT JOIN wms_partner pt ON pt.id=o.partner_id WHERE o.id=?`, [id]);
    if (!order) throw new NotFoundException('入库单不存在');
    const items = await query(
      `SELECT i.*, g.name AS goods_name, g.code AS goods_code, g.spec, g.unit, l.code AS location_code
       FROM wms_inbound_item i LEFT JOIN wms_goods g ON g.id=i.goods_id LEFT JOIN wms_location l ON l.id=i.location_id
       WHERE i.order_id=? ORDER BY i.id`, [id]);
    return { order, items };
  }

  /** 创建草稿（人工录入 或 AI 代建草稿，source 区分） */
  async create(d: { warehouseId: number; partnerId?: number; orderType?: string; remark?: string; source?: string; createBy?: string; items: ItemDTO[] }) {
    if (!d.items?.length) throw new BadRequestException('入库明细不能为空');
    const no = await nextNo('RK', 'wms_inbound');
    let totalQty = 0, totalAmount = 0;
    await tx(async (c) => {
      const [r] = await c.execute(
        'INSERT INTO wms_inbound (order_no,warehouse_id,partner_id,order_type,status,source,remark,create_by) VALUES (?,?,?,?,0,?,?,?)',
        [no, d.warehouseId, d.partnerId || null, d.orderType || 'PURCHASE', d.source || 'MANUAL', d.remark || null, d.createBy || 'system']);
      const orderId = (r as any).insertId;
      for (const it of d.items) {
        const qty = Number(it.qty);
        if (qty <= 0) throw new BadRequestException('明细数量必须大于 0');
        const price = Number(it.price || 0);
        totalQty += qty; totalAmount += qty * price;
        await c.execute('INSERT INTO wms_inbound_item (order_id,order_no,goods_id,location_id,batch_no,qty,price,production_at,expire_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [orderId, no, it.goodsId, it.locationId, it.batchNo || 'DEFAULT', qty, price, it.productionAt || null, it.expireAt || null]);
      }
      await c.execute('UPDATE wms_inbound SET total_qty=?, total_amount=? WHERE id=?', [totalQty, totalAmount, orderId]);
    });
    return { orderNo: no, status: 0 };
  }

  async update(id: number, d: { remark?: string; orderType?: string }) {
    const o = await queryOne('SELECT status FROM wms_inbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('入库单不存在');
    if (o.status !== 0) throw new BadRequestException('仅草稿可修改');
    await query('UPDATE wms_inbound SET remark=COALESCE(?,remark), order_type=COALESCE(?,order_type) WHERE id=?',
      [d.remark ?? null, d.orderType ?? null, id]);
    return { success: true };
  }

  /** 提交审核：草稿 → 待审核 */
  async submit(id: number) {
    const r = await query('UPDATE wms_inbound SET status=1 WHERE id=? AND status=0', [id]);
    if ((r as any).affectedRows === 0) throw new BadRequestException('仅草稿单可提交审核');
    return { success: true };
  }

  /** 审核通过：库存增加 + 写流水（同一事务） */
  async audit(id: number, operator: string) {
    const order = await queryOne('SELECT * FROM wms_inbound WHERE id=?', [id]);
    if (!order) throw new NotFoundException('入库单不存在');
    if (order.status === 2) throw new BadRequestException('单据已入库，请勿重复审核');
    const items = await query('SELECT * FROM wms_inbound_item WHERE order_id=?', [id]);
    if (!items.length) throw new BadRequestException('单据无明细，无法入库');

    await tx(async (c) => {
      const [locked]: any = await c.execute('SELECT id FROM wms_inbound WHERE id=? AND status<>2 FOR UPDATE', [id]);
      if (!locked[0]) throw new BadRequestException('单据状态已变更，请刷新');
      for (const it of items) {
        await this.increase(c, order.warehouse_id, it.location_id, it.goods_id, it.batch_no, it.qty,
          it.production_at, it.expire_at, order.order_no, operator);
      }
      await c.execute('UPDATE wms_inbound SET status=2, audit_by=?, audit_time=NOW() WHERE id=?', [operator, id]);
    });
    return { success: true, orderNo: order.order_no };
  }

  /** 作废 */
  async cancel(id: number) {
    const o = await queryOne('SELECT status FROM wms_inbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('入库单不存在');
    if (o.status === 2) throw new BadRequestException('已入库单据不可作废，请先做出库冲减');
    await query('UPDATE wms_inbound SET status=3 WHERE id=?', [id]);
    return { success: true };
  }

  /** 删除草稿及其明细 */
  async remove(id: number) {
    const o = await queryOne('SELECT status FROM wms_inbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('入库单不存在');
    if (o.status !== 0) throw new BadRequestException('仅草稿单可删除');
    await tx(async (c) => {
      await c.execute('DELETE FROM wms_inbound_item WHERE order_id=?', [id]);
      await c.execute('DELETE FROM wms_inbound WHERE id=?', [id]);
    });
    return { success: true };
  }

  private async increase(c: PoolConnection, wh: number, loc: number, goods: number, batch: string, qty: number, prod: any, exp: any, no: string, operator: string) {
    const [exist]: any = await c.execute('SELECT id, qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? FOR UPDATE', [wh, loc, goods, batch]);
    const row = exist[0];
    const before = row ? Number(row.qty) : 0;
    if (row) {
      await c.execute('UPDATE wms_inventory SET qty = qty + ? WHERE id=?', [qty, row.id]);
    } else {
      await c.execute('INSERT INTO wms_inventory (warehouse_id,location_id,goods_id,batch_no,qty,locked_qty,production_at,expire_at) VALUES (?,?,?,?,?,0,?,?)',
        [wh, loc, goods, batch, qty, prod || null, exp || null]);
    }
    await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['IN', no, wh, loc, goods, batch, qty, before, before + Number(qty), operator]);
  }
}
