import { db } from './db';

/**
 * 服务启动时的幂等结构兜底：旧库不必重跑 wms.sql 也能启动。
 * 全新安装请直接执行 sql/wms.sql，这里只负责增量补齐。
 */
export async function ensureExtraTables() {
  const safe = async (sql: string) => { try { await db.execute(sql); } catch { /* 已存在则忽略 */ } };

  await safe(`
    CREATE TABLE IF NOT EXISTS sys_token_blacklist (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      token VARCHAR(512) NOT NULL,
      expire_at DATETIME NOT NULL,
      PRIMARY KEY (id), UNIQUE KEY uk_token (token(255))
    ) ENGINE=InnoDB COMMENT='JWT 退出黑名单'
  `);

  // 冻结/解冻流水表：wms_freeze 为主单，本表记录每一次冻结/解冻明细
  await safe(`
    CREATE TABLE IF NOT EXISTS wms_freeze_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_no VARCHAR(32) NOT NULL COMMENT '冻结/解冻单号 DJ+日期+流水',
      type TINYINT NOT NULL DEFAULT 1 COMMENT '1冻结 2解冻',
      warehouse_id INT UNSIGNED NOT NULL,
      location_id INT UNSIGNED NOT NULL,
      goods_id INT UNSIGNED NOT NULL,
      batch_no VARCHAR(64) DEFAULT NULL,
      qty DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT '本次操作数量',
      reason VARCHAR(255) DEFAULT NULL,
      operator VARCHAR(64) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_order_no (order_no), KEY idx_goods (goods_id)
    ) ENGINE=InnoDB COMMENT='库存冻结/解冻流水'
  `);

  // 每日预警快照
  await safe(`
    CREATE TABLE IF NOT EXISTS wms_warning (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      warn_date DATE NOT NULL,
      warn_type TINYINT NOT NULL DEFAULT 1,
      goods_id BIGINT UNSIGNED NOT NULL,
      warehouse_id BIGINT UNSIGNED NULL,
      available DECIMAL(14,2) NOT NULL DEFAULT 0,
      threshold DECIMAL(14,2) NOT NULL DEFAULT 0,
      gap DECIMAL(14,2) NOT NULL DEFAULT 0,
      level VARCHAR(16) NOT NULL DEFAULT '预警',
      content VARCHAR(512) NULL,
      status TINYINT NOT NULL DEFAULT 0,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY idx_date_type (warn_date, warn_type)
    ) ENGINE=InnoDB COMMENT='库存预警快照'
  `);

  // 出入库单据类型（图片中的「采购入库 / 销售出库」下拉）
  for (const [table, defaultType] of [['wms_inbound', 'PURCHASE'], ['wms_outbound', 'SALES']]) {
    try {
      const [cols]: any = await db.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'order_type'`, [table]);
      if (!cols.length) {
        await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN order_type VARCHAR(32) NOT NULL DEFAULT '${defaultType}'`);
      }
    } catch { /* 表不存在时跳过，交由 wms.sql 建库 */ }
  }

  // 盘点明细允许「未录入实盘」，否则 scripts 里的 INSERT 会因 NOT NULL 失败
  try {
    const [cols]: any = await db.execute(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wms_check_item' AND COLUMN_NAME = 'real_qty'`);
    if (cols[0]?.IS_NULLABLE === 'NO') {
      await db.execute('ALTER TABLE wms_check_item MODIFY COLUMN real_qty DECIMAL(14,2) NULL DEFAULT NULL');
    }
  } catch { /* ignore */ }

  // 仓库与角色备注（图片中的「备注」列）
  for (const table of ['wms_warehouse', 'sys_role']) {
    try {
      const [cols]: any = await db.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'remark'`, [table]);
      if (!cols.length) await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN remark VARCHAR(255) NULL`);
    } catch { /* 表不存在时交由建库脚本 */ }
  }

  // AI 配置四张表：全新安装由 wms.sql 创建，这里保证旧库升级后不因缺表报错
  const aiTables = [
    `CREATE TABLE IF NOT EXISTS ai_model_config (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(64) NOT NULL, provider VARCHAR(64) NOT NULL DEFAULT 'openai_compatible',
      base_url VARCHAR(255) NOT NULL DEFAULT '', api_key VARCHAR(255) NOT NULL DEFAULT '',
      model VARCHAR(128) NOT NULL DEFAULT '', temperature DECIMAL(3,2) NOT NULL DEFAULT 0.10,
      enabled TINYINT NOT NULL DEFAULT 0, remark VARCHAR(255) NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB COMMENT='AI 模型配置'`,
    `CREATE TABLE IF NOT EXISTS ai_prompt_template (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL, name VARCHAR(128) NOT NULL,
      scene VARCHAR(64) NOT NULL DEFAULT 'main', content TEXT NOT NULL,
      variables VARCHAR(255) NULL, enabled TINYINT NOT NULL DEFAULT 1,
      remark VARCHAR(255) NULL, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_code (code)
    ) ENGINE=InnoDB COMMENT='AI Prompt 模板'`,
    `CREATE TABLE IF NOT EXISTS ai_function_tool (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL, name VARCHAR(128) NOT NULL,
      owner VARCHAR(64) NOT NULL DEFAULT 'order_expert', description VARCHAR(512) NULL,
      params_schema TEXT NULL, write_action TINYINT NOT NULL DEFAULT 0,
      enabled TINYINT NOT NULL DEFAULT 1, remark VARCHAR(255) NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_code (code)
    ) ENGINE=InnoDB COMMENT='AI Function 工具登记'`,
    `CREATE TABLE IF NOT EXISTS ai_mcp_server (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL, transport VARCHAR(32) NOT NULL DEFAULT 'sse',
      endpoint VARCHAR(255) NOT NULL DEFAULT '', command VARCHAR(255) NULL,
      args VARCHAR(512) NULL, env_json TEXT NULL, enabled TINYINT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT '未测试', last_check_time DATETIME NULL,
      remark VARCHAR(255) NULL, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB COMMENT='MCP 服务登记'`,
  ];
  for (const ddl of aiTables) await safe(ddl);
}
