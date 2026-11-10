#!/bin/bash
# 智能仓储 WMS + 仓储多Agent 一键初始化（纯 NestJS + MySQL + Vue3）
set -e
cd "$(dirname "$0")"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-root}"

echo "==> 1/4 建库（wms.sql 自带 CREATE DATABASE/USE，含演示数据与 AI 会话表）"
mysql -u"$DB_USER" -p"$DB_PASS" < sql/wms.sql
if [ "${WITH_DEMO:-0}" = "1" ]; then
  echo "   追加近 30 天出入库趋势演示单据"
  mysql -u"$DB_USER" -p"$DB_PASS" wms < sql/demo.sql
fi

echo "==> 2/4 生成后端 .env"
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  echo "   已生成 server/.env，请按实际填写 DB_PASSWORD / DEEPSEEK_API_KEY"
fi

echo "==> 3/4 后端依赖与构建"
(cd server && npm install && npm run build)

echo "==> 4/4 前端依赖与构建"
(cd web && npm install && npm run build)

echo "完成。启动后端：cd server && npm run start     # API http://localhost:3000/api"
echo "开发前端：cd web && npm run dev               # http://localhost:5173（/api 代理到 3000）"
echo "静态托管：server/src/app.module.ts 的 ServeStaticModule 会托管 web/dist"
