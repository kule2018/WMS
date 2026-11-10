import { queryOne } from './db';

/**
 * 单号规则：前缀 + yyyyMMdd + 4 位流水
 * RK 入库 / CK 出库 / YD 移库 / TZ 调整 / PD 盘点 / DJ 冻结
 * 流水取自当天该类单据数量，并发下由唯一索引兜底（失败重试一次即可）
 */
export async function nextNo(prefix: 'RK' | 'CK' | 'YD' | 'TZ' | 'PD' | 'DJ', table: string, column = 'order_no') {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const like = `${prefix}${day}%`;
  const row = await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} LIKE ?`, [like]);
  const seq = String((row?.c ?? 0) + 1).padStart(4, '0');
  return `${prefix}${day}${seq}`;
}
