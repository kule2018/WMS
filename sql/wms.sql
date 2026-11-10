-- =============================================================
--  智能仓储 WMS 系统  +  仓储多 Agent        数据库脚本 (MySQL 8.0)
--  字符集 utf8mb4 / InnoDB / 事务保证「单据过账 <=> 库存变动」原子性
-- =============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `wms` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `wms`;

-- ------------------------- 1. 系统权限：用户 / 角色 / 菜单 ----------
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`    VARCHAR(64)  NOT NULL COMMENT '登录账号',
  `password`    VARCHAR(128) NOT NULL COMMENT 'bcrypt 密文',
  `nickname`    VARCHAR(64)      NULL,
  `role_id`     BIGINT UNSIGNED  NULL,
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB COMMENT='系统用户';

DROP TABLE IF EXISTS `sys_role`;
CREATE TABLE `sys_role` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(64) NOT NULL, `role_key` VARCHAR(64) NOT NULL,
  `menu_ids`  VARCHAR(512) NOT NULL DEFAULT '' COMMENT '授权菜单 id，逗号分隔',
  `remark`    VARCHAR(255) NULL COMMENT '角色备注',
  PRIMARY KEY (`id`), UNIQUE KEY `uk_role_key` (`role_key`)
) ENGINE=InnoDB COMMENT='角色';

DROP TABLE IF EXISTS `sys_menu`;
CREATE TABLE `sys_menu` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `name`      VARCHAR(64) NOT NULL COMMENT '菜单名',
  `path`      VARCHAR(128)     NULL COMMENT '前端路由',
  `component` VARCHAR(128)     NULL,
  `icon`      VARCHAR(64)      NULL,
  `sort`      INT          NOT NULL DEFAULT 0,
  `menu_type` TINYINT      NOT NULL DEFAULT 1 COMMENT '1 目录 2 菜单 3 按钮',
  `perms`     VARCHAR(128)     NULL COMMENT '权限标识',
  `status`    TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`), KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB COMMENT='菜单（后端动态下发）';

-- ------------------------- 2. 基础主数据：仓库/库区/库位/商品/往来单位 --
DROP TABLE IF EXISTS `wms_warehouse`;
CREATE TABLE `wms_warehouse` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL, `name` VARCHAR(128) NOT NULL,
  `address` VARCHAR(255) NULL, `remark` VARCHAR(255) NULL, `status` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='仓库';

DROP TABLE IF EXISTS `wms_area`;
CREATE TABLE `wms_area` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL, `name` VARCHAR(128) NOT NULL, `status` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`), KEY `idx_wh` (`warehouse_id`)
) ENGINE=InnoDB COMMENT='库区';

DROP TABLE IF EXISTS `wms_location`;
CREATE TABLE `wms_location` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `warehouse_id` BIGINT UNSIGNED NOT NULL, `area_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL COMMENT '库位编码 A-01-01',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 正常 0 停用',
  PRIMARY KEY (`id`), UNIQUE KEY `uk_wh_code` (`warehouse_id`,`code`), KEY `idx_wh_area` (`warehouse_id`,`area_id`)
) ENGINE=InnoDB COMMENT='库位';

DROP TABLE IF EXISTS `wms_category`;
CREATE TABLE `wms_category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL, `parent_id` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='商品分类';

DROP TABLE IF EXISTS `wms_goods`;
CREATE TABLE `wms_goods` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(64)  NOT NULL COMMENT '商品编码',
  `name`        VARCHAR(128) NOT NULL,
  `category_id` BIGINT UNSIGNED NULL,
  `spec`        VARCHAR(128)     NULL COMMENT '规格型号',
  `unit`        VARCHAR(32)  NOT NULL DEFAULT '件',
  `min_stock`   DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '安全库存下限',
  `max_stock`   DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '库存上限(0=不限,用于超储预警)',
  `shelf_days`  INT          NOT NULL DEFAULT 0 COMMENT '保质期天数(0=不管理)',
  `status`      TINYINT      NOT NULL DEFAULT 1,
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='商品档案';

DROP TABLE IF EXISTS `wms_partner`;
CREATE TABLE `wms_partner` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` TINYINT NOT NULL COMMENT '1 供应商 2 客户',
  `code` VARCHAR(64) NOT NULL, `name` VARCHAR(128) NOT NULL,
  `contact` VARCHAR(64) NULL, `phone` VARCHAR(32) NULL, `status` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_code_type` (`code`,`type`)
) ENGINE=InnoDB COMMENT='供应商/客户';

-- ------------------------- 3. 库存核心：库存 / 冻结 / 流水 ------------
DROP TABLE IF EXISTS `wms_inventory`;
CREATE TABLE `wms_inventory` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `warehouse_id`  BIGINT UNSIGNED NOT NULL,
  `location_id`   BIGINT UNSIGNED NOT NULL,
  `goods_id`      BIGINT UNSIGNED NOT NULL,
  `batch_no`      VARCHAR(64) NOT NULL DEFAULT 'DEFAULT' COMMENT '批次',
  `production_at` DATE             NULL,
  `expire_at`     DATE             NULL,
  `qty`           DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '在库量',
  `locked_qty`    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '冻结量(不可出库)',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv` (`warehouse_id`,`location_id`,`goods_id`,`batch_no`),
  KEY `idx_goods` (`goods_id`)
) ENGINE=InnoDB COMMENT='实时库存（在库量-冻结量=可用量）';

DROP TABLE IF EXISTS `wms_inventory_log`;
CREATE TABLE `wms_inventory_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `biz_type` VARCHAR(32) NOT NULL COMMENT 'IN/OUT/MOVE/ADJUST/CHECK/FREEZE',
  `biz_no`   VARCHAR(64)     NULL COMMENT '关联单号',
  `warehouse_id` BIGINT UNSIGNED NOT NULL, `location_id` BIGINT UNSIGNED NOT NULL,
  `goods_id` BIGINT UNSIGNED NOT NULL, `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `change_qty` DECIMAL(14,2) NOT NULL COMMENT '变动量(可负)',
  `before_qty` DECIMAL(14,2) NOT NULL, `after_qty` DECIMAL(14,2) NOT NULL,
  `operator` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_goods_time` (`goods_id`,`create_time`), KEY `idx_biz` (`biz_no`)
) ENGINE=InnoDB COMMENT='库存流水（只增不改）';

-- ------------------------- 4. 单据：入库/出库/移库/调整/盘点/冻结 -----
-- status: 0 草稿  1 待审核  2 已完成(已过账)  3 已作废
DROP TABLE IF EXISTS `wms_inbound`;
CREATE TABLE `wms_inbound` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL,
  `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `partner_id` BIGINT UNSIGNED NULL COMMENT '供应商',
  `order_type` VARCHAR(32) NOT NULL DEFAULT 'PURCHASE' COMMENT '入库类型 PURCHASE/TRANSFER/RETURN',
  `status` TINYINT NOT NULL DEFAULT 0,
  `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL 人工 / AI 草稿',
  `total_qty` DECIMAL(14,2) NOT NULL DEFAULT 0, `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`), KEY `idx_status` (`status`)
) ENGINE=InnoDB COMMENT='入库单';

DROP TABLE IF EXISTS `wms_inbound_item`;
CREATE TABLE `wms_inbound_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL, `order_no` VARCHAR(64) NOT NULL,
  `goods_id` BIGINT UNSIGNED NOT NULL, `location_id` BIGINT UNSIGNED NOT NULL,
  `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `qty` DECIMAL(14,2) NOT NULL, `price` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `production_at` DATE NULL, `expire_at` DATE NULL,
  PRIMARY KEY (`id`), KEY `idx_order` (`order_id`)
) ENGINE=InnoDB COMMENT='入库单明细';

DROP TABLE IF EXISTS `wms_outbound`;
CREATE TABLE `wms_outbound` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL,
  `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `partner_id` BIGINT UNSIGNED NULL COMMENT '客户',
  `order_type` VARCHAR(32) NOT NULL DEFAULT 'SALES' COMMENT '出库类型 SALES/TRANSFER/RETURN',
  `status` TINYINT NOT NULL DEFAULT 0,
  `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  `total_qty` DECIMAL(14,2) NOT NULL DEFAULT 0, `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`), KEY `idx_status` (`status`)
) ENGINE=InnoDB COMMENT='出库单';

DROP TABLE IF EXISTS `wms_outbound_item`;
CREATE TABLE `wms_outbound_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL, `order_no` VARCHAR(64) NOT NULL,
  `goods_id` BIGINT UNSIGNED NOT NULL, `location_id` BIGINT UNSIGNED NOT NULL,
  `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `qty` DECIMAL(14,2) NOT NULL, `price` DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`), KEY `idx_order` (`order_id`)
) ENGINE=InnoDB COMMENT='出库单明细';

DROP TABLE IF EXISTS `wms_move`;
CREATE TABLE `wms_move` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL, `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `from_location_id` BIGINT UNSIGNED NOT NULL, `to_location_id` BIGINT UNSIGNED NOT NULL,
  `goods_id` BIGINT UNSIGNED NOT NULL, `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `qty` DECIMAL(14,2) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0, `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`)
) ENGINE=InnoDB COMMENT='移库单';

DROP TABLE IF EXISTS `wms_adjust`;
CREATE TABLE `wms_adjust` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL, `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `location_id` BIGINT UNSIGNED NOT NULL, `goods_id` BIGINT UNSIGNED NOT NULL,
  `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `real_qty` DECIMAL(14,2) NOT NULL COMMENT '实盘/调整后数量',
  `diff_qty` DECIMAL(14,2) NOT NULL COMMENT '差异量',
  `adjust_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1 盘盈 2 盘亏',
  `status` TINYINT NOT NULL DEFAULT 0, `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`)
) ENGINE=InnoDB COMMENT='库存调整单(盘盈盘亏)';

DROP TABLE IF EXISTS `wms_check`;
CREATE TABLE `wms_check` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL, `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0, `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`)
) ENGINE=InnoDB COMMENT='盘点单';

DROP TABLE IF EXISTS `wms_check_item`;
CREATE TABLE `wms_check_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL, `location_id` BIGINT UNSIGNED NOT NULL,
  `goods_id` BIGINT UNSIGNED NOT NULL, `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `book_qty` DECIMAL(14,2) NOT NULL COMMENT '账面量', `real_qty` DECIMAL(14,2) NULL DEFAULT NULL COMMENT '实盘量(未录入为 NULL)',
  `diff_qty` DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '差异量',
  PRIMARY KEY (`id`), KEY `idx_order` (`order_id`)
) ENGINE=InnoDB COMMENT='盘点明细';

DROP TABLE IF EXISTS `wms_freeze`;
CREATE TABLE `wms_freeze` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL, `warehouse_id` BIGINT UNSIGNED NOT NULL,
  `location_id` BIGINT UNSIGNED NOT NULL, `goods_id` BIGINT UNSIGNED NOT NULL,
  `batch_no` VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
  `qty` DECIMAL(14,2) NOT NULL,
  `action` TINYINT NOT NULL COMMENT '1 冻结 2 解冻',
  `status` TINYINT NOT NULL DEFAULT 0, `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  `remark` VARCHAR(255) NULL, `audit_by` VARCHAR(64) NULL, `audit_time` DATETIME NULL,
  `create_by` VARCHAR(64) NULL, `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_no` (`order_no`)
) ENGINE=InnoDB COMMENT='冻结/解冻单';

-- ------------------------- 4.1 冻结流水 / JWT 黑名单 / 预警快照 ---------
DROP TABLE IF EXISTS `wms_freeze_log`;
CREATE TABLE `wms_freeze_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(32) NOT NULL COMMENT '冻结/解冻单号 DJ+日期+流水',
  `type` TINYINT NOT NULL DEFAULT 1 COMMENT '1 冻结 2 解冻',
  `warehouse_id` INT UNSIGNED NOT NULL,
  `location_id` INT UNSIGNED NOT NULL,
  `goods_id` INT UNSIGNED NOT NULL,
  `batch_no` VARCHAR(64) DEFAULT NULL,
  `qty` DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT '本次操作数量',
  `reason` VARCHAR(255) DEFAULT NULL,
  `operator` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_order_no` (`order_no`), KEY `idx_goods` (`goods_id`)
) ENGINE=InnoDB COMMENT='库存冻结/解冻流水';

DROP TABLE IF EXISTS `sys_token_blacklist`;
CREATE TABLE `sys_token_blacklist` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token` VARCHAR(512) NOT NULL,
  `expire_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_token` (`token`(255))
) ENGINE=InnoDB COMMENT='JWT 退出黑名单';

DROP TABLE IF EXISTS `wms_warning`;
CREATE TABLE `wms_warning` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `warn_date` DATE NOT NULL COMMENT '扫描日期',
  `warn_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1 低库存 2 超储 3 临期',
  `goods_id` BIGINT UNSIGNED NOT NULL,
  `warehouse_id` BIGINT UNSIGNED NULL,
  `available` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `threshold` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `gap` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `level` VARCHAR(16) NOT NULL DEFAULT '预警',
  `content` VARCHAR(512) NULL,
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 未处理 1 已处理',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_date_type` (`warn_date`,`warn_type`)
) ENGINE=InnoDB COMMENT='库存预警快照（每日定时扫描写入）';

-- ------------------------- 5. 仓储多 Agent：会话 / 消息 / 执行步骤 ----
DROP TABLE IF EXISTS `ai_session`;
CREATE TABLE `ai_session` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(128) NOT NULL DEFAULT '新会话',
  `agent_count` INT NOT NULL DEFAULT 0 COMMENT '本会话协同专家数',
  `tool_count`  INT NOT NULL DEFAULT 0 COMMENT '本会话工具调用次数',
  `last_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_user` (`user_id`,`last_time`)
) ENGINE=InnoDB COMMENT='AI 会话（多会话，服务重启不丢）';

DROP TABLE IF EXISTS `ai_message`;
CREATE TABLE `ai_message` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `role` VARCHAR(16) NOT NULL COMMENT 'user/assistant',
  `content` MEDIUMTEXT NOT NULL,
  `elapsed` DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '耗时(秒)',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_session` (`session_id`,`id`)
) ENGINE=InnoDB COMMENT='AI 消息（多轮记忆来源）';

DROP TABLE IF EXISTS `ai_step`;
CREATE TABLE `ai_step` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `message_id` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `actor` VARCHAR(64) NOT NULL COMMENT '调度主管/库存查询专家/...',
  `actor_type` VARCHAR(16) NOT NULL DEFAULT 'agent' COMMENT 'agent/tool',
  `event` VARCHAR(32) NOT NULL COMMENT 'start/end/result',
  `content` VARCHAR(2000) NOT NULL DEFAULT '' COMMENT '结果摘要',
  `elapsed` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_session_msg` (`session_id`,`message_id`,`id`)
) ENGINE=InnoDB COMMENT='AI 执行步骤（时间线可回放）';

-- ------------------------- 5.1 AI 配置：模型 / Prompt / 工具 / MCP -----
DROP TABLE IF EXISTS `ai_model_config`;
CREATE TABLE `ai_model_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL COMMENT '配置名称',
  `provider` VARCHAR(64) NOT NULL DEFAULT 'openai_compatible' COMMENT '供应商标识',
  `base_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'OpenAI 兼容接口地址',
  `api_key` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'API Key，列表接口会脱敏',
  `model` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '模型名称',
  `temperature` DECIMAL(3,2) NOT NULL DEFAULT 0.10 COMMENT '生成温度',
  `enabled` TINYINT NOT NULL DEFAULT 0 COMMENT '1 启用；系统只取第一条启用记录',
  `remark` VARCHAR(255) NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='AI 模型配置';

DROP TABLE IF EXISTS `ai_prompt_template`;
CREATE TABLE `ai_prompt_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL COMMENT '模板编码：main / inventory_expert / ...',
  `name` VARCHAR(128) NOT NULL COMMENT '模板名称',
  `scene` VARCHAR(64) NOT NULL DEFAULT 'main' COMMENT '使用场景',
  `content` TEXT NOT NULL COMMENT '模板正文',
  `variables` VARCHAR(255) NULL COMMENT '占位变量名，逗号分隔',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '1 生效，覆盖内置默认模板',
  `remark` VARCHAR(255) NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='AI Prompt 模板';

DROP TABLE IF EXISTS `ai_function_tool`;
CREATE TABLE `ai_function_tool` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL COMMENT '工具编码，与 buildTools 返回的函数名一致',
  `name` VARCHAR(128) NOT NULL COMMENT '工具显示名',
  `owner` VARCHAR(64) NOT NULL DEFAULT 'order_expert' COMMENT '归属专家',
  `description` VARCHAR(512) NULL COMMENT '工具用途说明',
  `params_schema` TEXT NULL COMMENT '参数 JSON Schema（登记与文档用）',
  `write_action` TINYINT NOT NULL DEFAULT 0 COMMENT '1 写工具；写工具只允许生成草稿',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '0 停用后不再注册给专家',
  `remark` VARCHAR(255) NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='AI Function 工具登记';

DROP TABLE IF EXISTS `ai_mcp_server`;
CREATE TABLE `ai_mcp_server` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL COMMENT 'MCP 服务名称',
  `transport` VARCHAR(32) NOT NULL DEFAULT 'sse' COMMENT 'sse / stdio / streamable_http',
  `endpoint` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'HTTP/SSE 地址',
  `command` VARCHAR(255) NULL COMMENT 'stdio 启动命令',
  `args` VARCHAR(512) NULL COMMENT 'stdio 启动参数',
  `env_json` TEXT NULL COMMENT '环境变量 JSON',
  `enabled` TINYINT NOT NULL DEFAULT 0 COMMENT '1 启用登记',
  `status` VARCHAR(32) NOT NULL DEFAULT '未测试' COMMENT '最近一次连通性结果',
  `last_check_time` DATETIME NULL,
  `remark` VARCHAR(255) NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='MCP 服务登记';

-- =============================================================
--  演示数据
-- =============================================================
-- 模型配置默认不启用：未配置 API Key 时仍使用 .env 与规则兜底，避免改变既有行为
INSERT INTO `ai_model_config` (`id`,`name`,`provider`,`base_url`,`api_key`,`model`,`temperature`,`enabled`,`remark`) VALUES
(1,'DeepSeek 官方','deepseek','https://api.deepseek.com/v1','','deepseek-chat',0.10,0,'在页面填入 API Key 并启用后生效'),
(2,'本地 OpenAI 兼容服务','openai_compatible','http://127.0.0.1:8899/v1','','fake-model',0.10,0,'联调示例配置');

-- Prompt 模板默认停用：保持代码内置提示词，页面上启用后才会覆盖
INSERT INTO `ai_prompt_template` (`id`,`code`,`name`,`scene`,`content`,`variables`,`enabled`,`remark`) VALUES
(1,'main','调度主管提示词','main','你是仓储多Agent的调度主管。先理解意图，再分派库存查询、单据管理、预警分析、统计分析四位专家；最终答复使用 Markdown 表格，数字必须来自专家返回的真实数据。','question',0,'启用后覆盖内置 MAIN_PROMPT'),
(2,'inventory_expert','库存查询专家提示词','inventory_expert','你是库存查询专家。回答需给出在库量、冻结量、可用量（可用=在库-冻结），并用表格列出明细。','question',0,'启用后覆盖内置专家提示词'),
(3,'order_expert','单据管理专家提示词','order_expert','你是单据管理专家。查询六类单据；代建单只能生成 status=0 的草稿，出库草稿需逐行校验可用库存。','question',0,'启用后覆盖内置专家提示词'),
(4,'warning_expert','预警分析专家提示词','warning_expert','你是预警分析专家。给出低库存、超储、临期结论与补货建议，缺口=安全库存-可用量。','question',0,'启用后覆盖内置专家提示词'),
(5,'stats_expert','统计分析专家提示词','stats_expert','你是统计分析专家。给出出入库趋势、库存结构与简短结论。','question',0,'启用后覆盖内置专家提示词');

-- Function 工具登记：与 buildTools / 写工具一一对应，全部默认启用
INSERT INTO `ai_function_tool` (`id`,`code`,`name`,`owner`,`description`,`write_action`,`enabled`,`remark`) VALUES
(1,'query_realtime_inventory','实时库存查询','inventory_expert','按仓库、商品查在库量与可用量',0,1,''),
(2,'query_inventory_summary','库存汇总','inventory_expert','在库、冻结、可用合计',0,1,''),
(3,'query_inventory_log','库存流水','inventory_expert','库存变动只增日志',0,1,''),
(4,'query_warehouse_location','仓库库位结构','inventory_expert','仓库、库区、库位三级结构',0,1,''),
(5,'query_inbound_orders','入库单查询','order_expert','按状态、单号查入库单',0,1,''),
(6,'query_outbound_orders','出库单查询','order_expert','按状态、单号查出库单',0,1,''),
(7,'query_move_orders','移库单查询','order_expert','库位间调拨单据',0,1,''),
(8,'query_adjust_orders','调整单查询','order_expert','盘盈盘亏调整单据',0,1,''),
(9,'query_check_orders','盘点单查询','order_expert','盘点单与明细',0,1,''),
(10,'query_freeze_orders','冻结单查询','order_expert','冻结与解冻流水',0,1,''),
(11,'search_goods','商品检索','order_expert','按编码或名称查商品',0,1,''),
(12,'search_partner','往来单位检索','order_expert','供应商与客户',0,1,''),
(13,'query_low_stock','低库存预警','warning_expert','低于安全库存的商品',0,1,''),
(14,'query_overstock','超储预警','warning_expert','可用量超过上限的商品',0,1,''),
(15,'query_expiring','临期预警','warning_expert','按天数查将到期批次',0,1,''),
(16,'query_stats_trend','出入库趋势','stats_expert','近 N 天出入库统计',0,1,''),
(17,'query_stats_structure','库存结构','stats_expert','按仓库或分类的库存占比',0,1,''),
(18,'create_inbound_draft','代建入库草稿','order_expert','只生成 status=0 的入库草稿',1,1,'写工具：仍需人工审核'),
(19,'create_outbound_draft','代建出库草稿','order_expert','逐行校验可用库存后生成出库草稿',1,1,'写工具：仍需人工审核');

-- MCP 服务登记：默认停用，仅记录连接信息，不随 Agent 启动外部进程
INSERT INTO `ai_mcp_server` (`id`,`name`,`transport`,`endpoint`,`command`,`args`,`enabled`,`status`,`remark`) VALUES
(1,'本地文件系统 MCP','stdio','','npx','-y @modelcontextprotocol/server-filesystem /data',0,'未测试','示例：stdio 型服务'),
(2,'自定义 SSE 服务','sse','http://127.0.0.1:9000/sse','','',0,'未测试','示例：SSE 型服务');

INSERT INTO `sys_role` (`id`,`role_name`,`role_key`,`menu_ids`,`remark`) VALUES
(1,'超级管理员','admin','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29','系统内置，拥有全部权限'),
(2,'仓库管理员','keeper','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,24','仓库日常作业与审核'),
(3,'普通用户','viewer','1,19,24,12','仅可查看库存与使用 AI 问答');

-- 一级菜单 + 二级菜单，path 与前端路由一一对应
INSERT INTO `sys_menu` (`id`,`parent_id`,`name`,`path`,`component`,`icon`,`sort`,`menu_type`,`perms`) VALUES
(1,0,'首页','/dashboard','Dashboard','home',1,2,'dashboard:view'),
(2,0,'基础数据','/basic','Layout','box',2,1,NULL),
(3,2,'仓库管理','/basic/warehouse','BasicList',NULL,1,2,'basic:warehouse'),
(4,2,'库位管理','/basic/location','BasicList',NULL,2,2,'basic:location'),
(5,2,'商品档案','/basic/goods','BasicList',NULL,3,2,'basic:goods'),
(6,2,'商品分类','/basic/category','BasicList',NULL,4,2,'basic:category'),
(7,2,'供应商管理','/basic/supplier','BasicList',NULL,5,2,'basic:supplier'),
(8,2,'客户管理','/basic/customer','BasicList',NULL,6,2,'basic:customer'),
(9,0,'入库管理','/inbound','OrderList','download',3,2,'inbound:list'),
(10,0,'出库管理','/outbound','OrderList','upload',4,2,'outbound:list'),
(11,0,'库存管理','/inventory','Layout','grid',5,1,NULL),
(12,11,'实时库存','/inventory/stock','Inventory',NULL,1,2,'inventory:stock'),
(13,11,'库存流水','/inventory/log','Inventory',NULL,2,2,'inventory:log'),
(14,11,'移库管理','/inventory/move','Inventory',NULL,3,2,'inventory:move'),
(15,11,'库存调整','/inventory/adjust','Inventory',NULL,4,2,'inventory:adjust'),
(16,11,'库存预警','/inventory/warning','Inventory',NULL,5,2,'inventory:warning'),
(17,11,'库存冻结','/inventory/freeze','Inventory',NULL,6,2,'inventory:freeze'),
(18,0,'盘点管理','/check','Check','list',6,2,'check:list'),
(19,0,'仓储多Agent','/agent','AgentChat','chat',7,2,'agent:chat'),
(20,0,'系统管理','/system','Layout','setting',8,1,NULL),
(21,20,'用户管理','/system/user','SystemList',NULL,1,2,'system:user'),
(22,20,'角色管理','/system/role','SystemList',NULL,2,2,'system:role'),
(23,20,'菜单管理','/system/menu','SystemList',NULL,3,2,'system:menu'),
(24,0,'工作台','/portal','Portal','user',9,2,'portal:view'),
(25,0,'AI 配置','/ai-config','Layout','Sparkles',10,1,NULL),
(26,25,'模型配置','/ai-config/model','AiConfig',NULL,1,2,'ai:model'),
(27,25,'Prompt 模板','/ai-config/prompt','AiConfig',NULL,2,2,'ai:prompt'),
(28,25,'Function 工具','/ai-config/tool','AiConfig',NULL,3,2,'ai:tool'),
(29,25,'MCP 服务','/ai-config/mcp','AiConfig',NULL,4,2,'ai:mcp');

-- 演示账号：admin / keeper / viewer，密码统一为 admin123（同一演示密文）
INSERT INTO `sys_user` (`id`,`username`,`password`,`nickname`,`role_id`) VALUES
(1,'admin','$2b$10$wtxhLKO3a5ZSguyjEHFhUOHBP3j9F2uYDhgF7sZlYxaFSqWpcdtyy','系统管理员',1),
(2,'keeper','$2b$10$wtxhLKO3a5ZSguyjEHFhUOHBP3j9F2uYDhgF7sZlYxaFSqWpcdtyy','仓库主管',2),
(3,'viewer','$2b$10$wtxhLKO3a5ZSguyjEHFhUOHBP3j9F2uYDhgF7sZlYxaFSqWpcdtyy','普通用户',3);

INSERT INTO `wms_warehouse` (`id`,`code`,`name`,`address`,`remark`) VALUES
(1,'WH-CENTRAL','中央仓','广州市黄埔区物流大道 1 号','总仓，主力发货仓'),
(2,'WH-SOUTH','华南分仓','佛山市南海区仓储园 8 号','区域配送仓');

INSERT INTO `wms_area` (`id`,`warehouse_id`,`code`,`name`) VALUES
(1,1,'A','中央仓-A 区数码'),(2,1,'B','中央仓-B 区配件'),(3,2,'A','华南分仓-A 区');

INSERT INTO `wms_location` (`id`,`warehouse_id`,`area_id`,`code`) VALUES
(1,1,1,'A-01-01'),(2,1,1,'A-01-02'),(3,1,1,'A-02-01'),
(4,1,2,'B-01-01'),(5,1,2,'B-01-02'),(6,2,3,'A-01-01'),(7,2,3,'A-01-02');

INSERT INTO `wms_category` (`id`,`name`,`parent_id`) VALUES
(1,'数码配件',0),(2,'线材',0),(3,'包材',0);

INSERT INTO `wms_goods` (`id`,`code`,`name`,`category_id`,`spec`,`unit`,`min_stock`,`max_stock`,`shelf_days`) VALUES
(1,'GOODS001','快充充电器 20W 黑色',1,'20W/Type-C','件',50,500,0),
(2,'GOODS002','USB-C 编织数据线 1米',2,'1m/黑色','根',100,2000,0),
(3,'GOODS003','无线蓝牙耳机 5.3',1,'TWS/白色','副',40,300,0),
(4,'GOODS004','移动电源 10000mAh',1,'10000mAh','个',30,200,0),
(5,'GOODS005','快递纸箱 5层加厚',3,'50x40x30','个',200,5000,0);

INSERT INTO `wms_partner` (`id`,`type`,`code`,`name`,`contact`,`phone`) VALUES
(1,1,'SUP001','深圳市恒达电子有限公司','李经理','13800138001'),
(2,1,'SUP002','东莞市联创线材厂','王厂长','13900139002'),
(3,2,'CUS001','广州星河贸易有限公司','陈主管','13700137003'),
(4,2,'CUS002','线上一号店','客服组','13600136004');

INSERT INTO `wms_inventory` (`warehouse_id`,`location_id`,`goods_id`,`batch_no`,`qty`,`locked_qty`) VALUES
(1,1,1,'PC20261020A',70,0),(1,2,1,'PC20261020A',8,0),(1,3,2,'PC20261020A',200,0),
(1,4,3,'PC20261101A',16,0),(1,5,4,'PC20261105A',12,4),(2,6,1,'PC20261015A',30,0),(2,7,5,'PC20261108A',600,0);

INSERT INTO `wms_inbound` (`id`,`order_no`,`warehouse_id`,`partner_id`,`status`,`source`,`total_qty`,`total_amount`,`create_by`,`audit_by`,`audit_time`) VALUES
(1,'RK202611010001',1,1,2,'MANUAL',200,5600,'admin','admin','2026-11-01 10:12:00'),
(2,'RK202611050001',1,2,2,'MANUAL',16,1280,'keeper','keeper','2026-11-05 15:30:00'),
(3,'RK202611090001',1,1,0,'MANUAL',120,3600,'keeper',NULL,NULL);
INSERT INTO `wms_inbound_item` (`order_id`,`order_no`,`goods_id`,`location_id`,`batch_no`,`qty`,`price`) VALUES
(1,'RK202611010001',1,1,'PC20261020A',78,28),(1,'RK202611010001',2,3,'PC20261020A',122,8),
(2,'RK202611050001',3,4,'PC20261101A',16,80),(3,'RK202611090001',1,1,'PC20261109A',120,30);

INSERT INTO `wms_outbound` (`id`,`order_no`,`warehouse_id`,`partner_id`,`status`,`source`,`total_qty`,`total_amount`,`create_by`,`audit_by`,`audit_time`) VALUES
(1,'CK202611020001',1,3,2,'MANUAL',10,320,'keeper','admin','2026-11-02 09:20:00'),
(2,'CK202611060001',1,4,1,'MANUAL',20,160,'keeper',NULL,NULL);
INSERT INTO `wms_outbound_item` (`order_id`,`order_no`,`goods_id`,`location_id`,`batch_no`,`qty`,`price`) VALUES
(1,'CK202611020001',2,3,'PC20261020A',10,32),(2,'CK202611060001',2,3,'PC20261020A',20,8);

INSERT INTO `wms_freeze` (`order_no`,`warehouse_id`,`location_id`,`goods_id`,`batch_no`,`qty`,`action`,`status`,`audit_by`,`audit_time`) VALUES
('DJ202611050001',1,5,4,'PC20261105A',4,1,2,'admin','2026-11-05 16:00:00');

INSERT INTO `wms_inventory_log` (`biz_type`,`biz_no`,`warehouse_id`,`location_id`,`goods_id`,`batch_no`,`change_qty`,`before_qty`,`after_qty`,`operator`) VALUES
('IN','RK202611010001',1,1,1,'PC20261020A',78,0,78,'admin'),
('IN','RK202611010001',1,3,2,'PC20261020A',122,0,122,'admin'),
('OUT','CK202611020001',1,3,2,'PC20261020A',-10,122,112,'admin'),
('IN','RK202611050001',1,4,3,'PC20261101A',16,0,16,'keeper'),
('FREEZE','DJ202611050001',1,5,4,'PC20261105A',0,12,12,'admin');

SET FOREIGN_KEY_CHECKS = 1;
SELECT 'WMS 初始化完成' AS msg;
