-- =============================================================
--  演示数据（幂等，可重复执行）
--  生成近 30 天「已审核」入库/出库单 + 库存流水，让首页看板与
--  Agent 的「趋势/统计」首屏即有数据；已存在同号单据则跳过。
--  用法：mysql -uroot -p wms < sql/demo.sql
-- =============================================================
USE wms;

-- 冻结流水表统一由 sql/wms.sql 创建（结构与 wms_freeze 不同，勿用 LIKE 复制）

DELIMITER $$
DROP PROCEDURE IF EXISTS `sp_gen_demo` $$
CREATE PROCEDURE `sp_gen_demo`()
BEGIN
  DECLARE v_day INT DEFAULT 29;
  DECLARE v_wh  INT;
  DECLARE v_goods INT;
  DECLARE v_loc INT;
  DECLARE v_qty INT;
  DECLARE v_no  VARCHAR(64);
  DECLARE v_exists INT;

  WHILE v_day >= 0 DO
    SET v_wh = IF(MOD(v_day, 3) = 0, 2, 1);  -- 中央仓为主，华东仓少量

    -- ---------- 入库单（每 2 天一单，已审核） ----------
    IF MOD(v_day, 2) = 0 THEN
      SET v_no = CONCAT('RK', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL v_day DAY), '%Y%m%d'), '01');
      SELECT COUNT(*) INTO v_exists FROM wms_inbound WHERE order_no = v_no;
      IF v_exists = 0 THEN
        SELECT id INTO v_goods FROM wms_goods WHERE status = 1 ORDER BY id LIMIT 1;
        SELECT id INTO v_loc FROM wms_location WHERE warehouse_id = v_wh AND status = 1 ORDER BY id LIMIT 1;
        SET v_qty = 20 + FLOOR(RAND() * 60);
        INSERT INTO wms_inbound (order_no, warehouse_id, partner_id, status, source, total_qty, total_amount, remark, audit_by, audit_time, create_by, create_time)
          VALUES (v_no, v_wh, 1, 2, 'MANUAL', v_qty, v_qty * 10, '演示数据', 'admin',
                  DATE_SUB(CURDATE(), INTERVAL v_day DAY) + INTERVAL 10 HOUR, 'admin',
                  DATE_SUB(CURDATE(), INTERVAL v_day DAY) + INTERVAL 9 HOUR);
        INSERT INTO wms_inbound_item (order_id, order_no, goods_id, location_id, batch_no, qty, price, production_at, expire_at)
          VALUES (LAST_INSERT_ID(), v_no, v_goods, v_loc, CONCAT('PC', DATE_FORMAT(CURDATE(), '%Y%m%d')), v_qty, 10,
                  DATE_SUB(CURDATE(), INTERVAL (v_day + 30) DAY), DATE_SUB(CURDATE(), INTERVAL (v_day - 300) DAY));
        INSERT INTO wms_inventory (warehouse_id, location_id, goods_id, batch_no, production_at, expire_at, qty, locked_qty)
          VALUES (v_wh, v_loc, v_goods, CONCAT('PC', DATE_FORMAT(CURDATE(), '%Y%m%d')),
                  DATE_SUB(CURDATE(), INTERVAL (v_day + 30) DAY), DATE_SUB(CURDATE(), INTERVAL (v_day - 300) DAY), v_qty, 0)
          ON DUPLICATE KEY UPDATE qty = qty + v_qty;
        INSERT INTO wms_inventory_log (biz_type, biz_no, warehouse_id, location_id, goods_id, batch_no, change_qty, before_qty, after_qty, operator)
          VALUES ('IN', v_no, v_wh, v_loc, v_goods, 'DEFAULT', v_qty, 0, v_qty, 'admin');
      END IF;
    END IF;

    -- ---------- 出库单（每天一单，已审核，先到期先出） ----------
    SET v_no = CONCAT('CK', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL v_day DAY), '%Y%m%d'), '01');
    SELECT COUNT(*) INTO v_exists FROM wms_outbound WHERE order_no = v_no;
    IF v_exists = 0 THEN
      SET v_qty = 5 + FLOOR(RAND() * 30);
      INSERT INTO wms_outbound (order_no, warehouse_id, partner_id, status, source, total_qty, total_amount, remark, audit_by, audit_time, create_by, create_time)
        VALUES (v_no, v_wh, 2, 2, 'MANUAL', v_qty, v_qty * 12, '演示数据', 'keeper',
                DATE_SUB(CURDATE(), INTERVAL v_day DAY) + INTERVAL 16 HOUR, 'keeper',
                DATE_SUB(CURDATE(), INTERVAL v_day DAY) + INTERVAL 15 HOUR);
      -- 取该仓库任一有货的库存行作为出库来源；无货则取首个库位（仅演示）
      SELECT i.goods_id, i.location_id INTO v_goods, v_loc FROM wms_inventory i
        WHERE i.warehouse_id = v_wh AND (i.qty - i.locked_qty) > 0 ORDER BY i.expire_at LIMIT 1;
      IF v_goods IS NULL THEN
        SELECT id INTO v_goods FROM wms_goods WHERE status = 1 ORDER BY id LIMIT 1;
        SELECT id INTO v_loc FROM wms_location WHERE warehouse_id = v_wh AND status = 1 ORDER BY id LIMIT 1;
      END IF;
      INSERT INTO wms_outbound_item (order_id, order_no, goods_id, location_id, batch_no, qty, price)
        VALUES (LAST_INSERT_ID(), v_no, v_goods, v_loc, 'DEFAULT', v_qty, 12);
      INSERT INTO wms_inventory (warehouse_id, location_id, goods_id, batch_no, qty, locked_qty)
        VALUES (v_wh, v_loc, v_goods, 'DEFAULT', 0, 0)
        ON DUPLICATE KEY UPDATE qty = GREATEST(0, qty - v_qty);
      INSERT INTO wms_inventory_log (biz_type, biz_no, warehouse_id, location_id, goods_id, batch_no, change_qty, before_qty, after_qty, operator)
        VALUES ('OUT', v_no, v_wh, v_loc, v_goods, 'DEFAULT', -v_qty, 0, 0, 'keeper');
    END IF;

    SET v_day = v_day - 1;
  END WHILE;
END $$
DELIMITER ;

CALL sp_gen_demo();
DROP PROCEDURE IF EXISTS `sp_gen_demo`;
UPDATE wms_inventory SET qty = 0 WHERE qty < 0;

-- 复盘：确认数据已生成
SELECT
  (SELECT COUNT(*) FROM wms_inbound WHERE status = 2)  AS 已审核入库单,
  (SELECT COUNT(*) FROM wms_outbound WHERE status = 2) AS 已审核出库单,
  (SELECT COALESCE(SUM(qty), 0) FROM wms_inventory)     AS 当前在库总量;
