import { Injectable } from '@nestjs/common';
import { query, queryOne, query as q } from '../../common/db';

/** 基础资料：仓库→库区→库位三级结构 + 商品档案 + 供应商/客户 */
@Injectable()
export class BasicService {
  listWarehouse() { return q('SELECT * FROM wms_warehouse ORDER BY id'); }
  createWarehouse(d: any) { return q('INSERT INTO wms_warehouse (code,name,address,remark) VALUES (?,?,?,?)', [d.code, d.name, d.address || null, d.remark || null]); }
  updateWarehouse(id: number, d: any) { return q('UPDATE wms_warehouse SET code=?,name=?,address=?,remark=? WHERE id=?', [d.code, d.name, d.address || null, d.remark || null, id]); }
  removeWarehouse(id: number) { return q('UPDATE wms_warehouse SET status=0 WHERE id=?', [id]); }

  listArea(warehouseId?: number) {
    return warehouseId
      ? q('SELECT a.*, w.name AS warehouse_name FROM wms_area a LEFT JOIN wms_warehouse w ON w.id=a.warehouse_id WHERE a.warehouse_id=? ORDER BY a.id', [warehouseId])
      : q('SELECT a.*, w.name AS warehouse_name FROM wms_area a LEFT JOIN wms_warehouse w ON w.id=a.warehouse_id ORDER BY a.id');
  }
  createArea(d: any) { return q('INSERT INTO wms_area (warehouse_id,code,name) VALUES (?,?,?)', [d.warehouseId, d.code, d.name]); }
  removeArea(id: number) { return q('UPDATE wms_area SET status=0 WHERE id=?', [id]); }

  listLocation(warehouseId?: number, areaId?: number) {
    let sql = `SELECT l.*, w.name AS warehouse_name, a.name AS area_name FROM wms_location l
               LEFT JOIN wms_warehouse w ON w.id=l.warehouse_id LEFT JOIN wms_area a ON a.id=l.area_id WHERE l.status=1`;
    const p: any[] = [];
    if (warehouseId) { sql += ' AND l.warehouse_id=?'; p.push(warehouseId); }
    if (areaId) { sql += ' AND l.area_id=?'; p.push(areaId); }
    return q(`${sql} ORDER BY l.code`, p);
  }
  createLocation(d: any) { return q('INSERT INTO wms_location (warehouse_id,area_id,code) VALUES (?,?,?)', [d.warehouseId, d.areaId, d.code]); }
  removeLocation(id: number) { return q('UPDATE wms_location SET status=0 WHERE id=?', [id]); }

  listCategory() { return q('SELECT * FROM wms_category ORDER BY id'); }
  createCategory(d: any) { return q('INSERT INTO wms_category (name,parent_id) VALUES (?,?)', [d.name, d.parentId || 0]); }
  removeCategory(id: number) { return q('DELETE FROM wms_category WHERE id=?', [id]); }

  listGoods(keyword?: string) {
    return keyword
      ? q(`SELECT g.*, c.name AS category_name FROM wms_goods g LEFT JOIN wms_category c ON c.id=g.category_id
            WHERE g.status=1 AND (g.name LIKE ? OR g.code LIKE ?) ORDER BY g.id`, [`%${keyword}%`, `%${keyword}%`])
      : q('SELECT g.*, c.name AS category_name FROM wms_goods g LEFT JOIN wms_category c ON c.id=g.category_id WHERE g.status=1 ORDER BY g.id');
  }
  getGoods(id: number) { return queryOne('SELECT * FROM wms_goods WHERE id=?', [id]); }
  createGoods(d: any) {
    return q('INSERT INTO wms_goods (code,name,category_id,spec,unit,min_stock,max_stock,shelf_days) VALUES (?,?,?,?,?,?,?,?)',
      [d.code, d.name, d.categoryId || null, d.spec || null, d.unit || '件', d.minStock ?? 0, d.maxStock ?? 0, d.shelfDays ?? 0]);
  }
  updateGoods(id: number, d: any) {
    return q('UPDATE wms_goods SET code=?,name=?,category_id=?,spec=?,unit=?,min_stock=?,max_stock=?,shelf_days=? WHERE id=?',
      [d.code, d.name, d.categoryId || null, d.spec || null, d.unit || '件', d.minStock ?? 0, d.maxStock ?? 0, d.shelfDays ?? 0, id]);
  }
  removeGoods(id: number) { return q('UPDATE wms_goods SET status=0 WHERE id=?', [id]); }

  listPartner(type?: number) {
    return type ? q('SELECT * FROM wms_partner WHERE status=1 AND type=? ORDER BY id', [type])
                : q('SELECT * FROM wms_partner WHERE status=1 ORDER BY type,id');
  }
  createPartner(d: any) { return q('INSERT INTO wms_partner (type,code,name,contact,phone) VALUES (?,?,?,?,?)', [d.type, d.code, d.name, d.contact || null, d.phone || null]); }
  updatePartner(id: number, d: any) {
    return q('UPDATE wms_partner SET type=?,code=?,name=?,contact=?,phone=? WHERE id=?',
      [d.type, d.code, d.name, d.contact || null, d.phone || null, id]);
  }
  removePartner(id: number) { return q('UPDATE wms_partner SET status=0 WHERE id=?', [id]); }

  updateArea(id: number, d: any) {
    return q('UPDATE wms_area SET warehouse_id=?,code=?,name=? WHERE id=?', [d.warehouseId, d.code, d.name, id]);
  }
  updateLocation(id: number, d: any) {
    return q('UPDATE wms_location SET warehouse_id=?,area_id=?,code=? WHERE id=?', [d.warehouseId, d.areaId, d.code, id]);
  }
  updateCategory(id: number, d: any) {
    return q('UPDATE wms_category SET name=?,parent_id=? WHERE id=?', [d.name, d.parentId || 0, id]);
  }

  /** 仓库 → 库区 → 库位 三级结构树（基础资料页左侧导航） */
  async structureTree() {
    const whs: any[] = await q('SELECT id, code, name FROM wms_warehouse WHERE status=1 ORDER BY id') as any[];
    const areas: any[] = await q('SELECT id, warehouse_id, code, name FROM wms_area WHERE status=1 ORDER BY id') as any[];
    const locs: any[] = await q('SELECT id, warehouse_id, area_id, code FROM wms_location WHERE status=1 ORDER BY code') as any[];
    return whs.map((w) => ({
      id: `w-${w.id}`, rawId: w.id, label: w.name, code: w.code, type: 'warehouse',
      count: locs.filter((l) => l.warehouse_id === w.id).length,
      children: areas.filter((a) => a.warehouse_id === w.id).map((a) => ({
        id: `a-${a.id}`, rawId: a.id, label: a.name, code: a.code, type: 'area',
        count: locs.filter((l) => l.area_id === a.id).length,
        children: locs.filter((l) => l.area_id === a.id).map((l) => ({
          id: `l-${l.id}`, rawId: l.id, label: l.code, code: l.code, type: 'location',
        })),
      })),
    }));
  }
}
