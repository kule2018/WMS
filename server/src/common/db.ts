import { config } from 'dotenv';
import * as path from 'path';
import mysql, { Pool } from 'mysql2/promise';

// 本文件在 AppModule 顶层 import 时就实例化了连接池，早于 ConfigModule 注入 .env，
// 所以这里用绝对路径显式加载 .env，保证 DB_PORT 等读取到真实值。
// 运行位置可能是 src/common 或 dist/common，向上两级即为项目根目录（server 目录）下的 .env。
config({ path: path.resolve(__dirname, '..', '..', '.env') });

/** 全局 MySQL 连接池：WMS 业务与 Agent 会话共用同一个库 */
function createPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    decimalNumbers: true,
    dateStrings: true,
  });
}

export const db = createPool();

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await db.execute(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

/** 事务包装：保证「单据过账 <=> 库存变动」原子性 */
export async function tx<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
