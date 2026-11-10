import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolConnection } from 'mysql2/promise';
import { query, queryOne, tx } from '../../common/db';
import { nextNo } from '../../common/seq';
import { ItemDTO, OrderQuery } from '../inbound/inbound.service';

/** 出库单：草稿(0) → 待审核(1) → 已出库(2)；建草稿与审核都逐行校验可用库存 */
@Injectable()
export class OutboundService {
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
    const total = await queryOne<any>(`SELECT COUNT(*) c FROM wms_outbound o ${clause}`, args);
    const page = Math.max(1, Number(p.page || 1));
    const size = Math.min(200, Math.max(1, Number(p.size || 20)));
    const rows = await query(
      `SELECT o.*, w.name AS warehouse_name, pt.name AS partner_name FROM wms_outbound o
       LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id LEFT JOIN wms_partner pt ON pt.id=o.partner_id
       ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    return { rows, total: Number(total?.c || 0), page, size };
  }

  async detail(id: number) {
    const order = await queryOne(`SELECT o.*, w.name AS warehouse_name, pt.name AS partner_name
      FROM wms_outbound o LEFT JOIN wms_warehouse w ON w.id=o.warehouse_id
      LEFT JOIN wms_partner pt ON pt.id=o.partner_id WHERE o.id=?`, [id]);
    if (!order) throw new NotFoundException('出库单不存在');
    const items = await query(
      `SELECT i.*, g.name AS goods_name, g.code AS goods_code, g.spec, g.unit, l.code AS location_code
       FROM wms_outbound_item i LEFT JOIN wms_goods g ON g.id=i.goods_id LEFT JOIN wms_location l ON l.id=i.location_id
       WHERE i.order_id=? ORDER BY i.id`, [id]);
    return { order, items };
  }

  async create(d: { warehouseId: number; partnerId?: number; orderType?: string; remark?: string; source?: string; createBy?: string; items: ItemDTO[] }) {
    if (!d.items?.length) throw new BadRequestException('出库明细不能为空');
    // 核心安全设计：创建出库草稿前逐行校验目标库位可用库存，不足整单拒绝
    const shortage = await this.checkAvailable(d.warehouseId, d.items);
    if (shortage.length) throw new BadRequestException(`可用库存不足，整单拒绝：${shortage.join('；')}`);
    const no = await nextNo('CK', 'wms_outbound');
    let totalQty = 0, totalAmount = 0;
    await tx(async (c) => {
      const [r] = await c.execute(
        'INSERT INTO wms_outbound (order_no,warehouse_id,partner_id,order_type,status,source,remark,create_by) VALUES (?,?,?,?,0,?,?,?)',
        [no, d.warehouseId, d.partnerId || null, d.orderType || 'SALES', d.source || 'MANUAL', d.remark || null, d.createBy || 'system']);
      const orderId = (r as any).insertId;
      for (const it of d.items) {
        const qty = Number(it.qty);
        if (qty <= 0) throw new BadRequestException('明细数量必须大于 0');
        const price = Number(it.price || 0);
        totalQty += qty; totalAmount += qty * price;
        await c.execute('INSERT INTO wms_outbound_item (order_id,order_no,goods_id,location_id,batch_no,qty,price) VALUES (?,?,?,?,?,?,?)',
          [orderId, no, it.goodsId, it.locationId, it.batchNo || 'DEFAULT', qty, price]);
      }
      await c.execute('UPDATE wms_outbound SET total_qty=?, total_amount=? WHERE id=?', [totalQty, totalAmount, orderId]);
    });
    return { orderNo: no, status: 0 };
  }

  /** 逐行校验目标库位/批次可用量（在库量 - 冻结量） */
  private async checkAvailable(warehouseId: number, items: any[]) {
    const shortage: string[] = [];
    for (const raw of items) {
      // 草稿来自前端 DTO（camelCase），审核时来自明细表（snake_case），这里统一兼容
      const goodsId = raw.goodsId ?? raw.goods_id;
      const locationId = raw.locationId ?? raw.location_id;
      const batchNo = raw.batchNo ?? raw.batch_no ?? 'DEFAULT';
      const qty = Number(raw.qty);
      const av = await queryOne<any>(
        'SELECT COALESCE(SUM(qty - locked_qty),0) AS available FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=?',
        [warehouseId, locationId, goodsId, batchNo]);
      const available = Number(av?.available || 0);
      if (available < qty) {
        const g: any = await queryOne('SELECT name FROM wms_goods WHERE id=?', [goodsId]);
        const l: any = await queryOne('SELECT code FROM wms_location WHERE id=?', [locationId]);
        shortage.push(`库位${l?.code || locationId} 商品${g?.name || goodsId} 批次${batchNo} 需${qty}，可用${available}`);
      }
    }
    return shortage;
  }

  async update(id: number, d: { remark?: string; orderType?: string }) {
    const o = await queryOne('SELECT status FROM wms_outbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('出库单不存在');
    if (o.status !== 0) throw new BadRequestException('仅草稿可修改');
    await query('UPDATE wms_outbound SET remark=COALESCE(?,remark), order_type=COALESCE(?,order_type) WHERE id=?',
      [d.remark ?? null, d.orderType ?? null, id]);
    return { success: true };
  }

  async submit(id: number) {
    const r = await query('UPDATE wms_outbound SET status=1 WHERE id=? AND status=0', [id]);
    if ((r as any).affectedRows === 0) throw new BadRequestException('仅草稿单可提交审核');
    return { success: true };
  }

  async audit(id: number, operator: string) {
    const order = await queryOne('SELECT * FROM wms_outbound WHERE id=?', [id]);
    if (!order) throw new NotFoundException('出库单不存在');
    if (order.status === 2) throw new BadRequestException('单据已出库，请勿重复审核');
    const items = await query('SELECT * FROM wms_outbound_item WHERE order_id=?', [id]);
    if (!items.length) throw new BadRequestException('单据无明细，无法出库');
    const shortage = await this.checkAvailable(order.warehouse_id, items as any);
    if (shortage.length) throw new BadRequestException(`可用库存不足，整单拒绝：${shortage.join('；')}`);

    await tx(async (c) => {
      const [locked]: any = await c.execute('SELECT id FROM wms_outbound WHERE id=? AND status<>2 FOR UPDATE', [id]);
      if (!locked[0]) throw new BadRequestException('单据状态已变更，请刷新');
      for (const it of items) {
        await this.decrease(c, order.warehouse_id, it.location_id, it.goods_id, it.batch_no || 'DEFAULT', Number(it.qty), order.order_no, operator);
      }
      await c.execute('UPDATE wms_outbound SET status=2, audit_by=?, audit_time=NOW() WHERE id=?', [operator, id]);
    });
    return { success: true, orderNo: order.order_no };
  }

  async cancel(id: number) {
    const o = await queryOne('SELECT status FROM wms_outbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('出库单不存在');
    if (o.status === 2) throw new BadRequestException('已出库单据不可作废');
    await query('UPDATE wms_outbound SET status=3 WHERE id=?', [id]);
    return { success: true };
  }

  /** 删除草稿及其明细 */
  async remove(id: number) {
    const o = await queryOne('SELECT status FROM wms_outbound WHERE id=?', [id]);
    if (!o) throw new NotFoundException('出库单不存在');
    if (o.status !== 0) throw new BadRequestException('仅草稿单可删除');
    await tx(async (c) => {
      await c.execute('DELETE FROM wms_outbound_item WHERE order_id=?', [id]);
      await c.execute('DELETE FROM wms_outbound WHERE id=?', [id]);
    });
    return { success: true };
  }

  private async decrease(c: PoolConnection, wh: number, loc: number, goods: number, batch: string, qty: number, no: string, operator: string) {
    const [rows]: any = await c.execute(
      'SELECT id, qty, locked_qty FROM wms_inventory WHERE warehouse_id=? AND location_id=? AND goods_id=? AND batch_no=? ORDER BY expire_at IS NULL, expire_at ASC FOR UPDATE',
      [wh, loc, goods, batch]);
    let rest = qty;
    for (const row of rows as any[]) {
      if (rest <= 0) break;
      // 只能用未被冻结的部分，遵循 FIFO
      const can = Number(row.qty) - Number(row.locked_qty);
      if (can <= 0) continue;
      const dec = Math.min(rest, can);
      await c.execute('UPDATE wms_inventory SET qty = qty - ? WHERE id=?', [dec, row.id]);
      await c.execute('INSERT INTO wms_inventory_log (biz_type,biz_no,warehouse_id,location_id,goods_id,batch_no,change_qty,before_qty,after_qty,operator) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ['OUT', no, wh, loc, goods, batch, -dec, Number(row.qty), Number(row.qty) - dec, operator]);
      rest -= dec;
    }
    if (rest > 0) throw new BadRequestException('可用库存不足，整单拒绝');
  }
}
