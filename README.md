# 智能仓储 WMS 系统（含仓储多 Agent）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Backend](https://img.shields.io/badge/backend-NestJS%2011-E0234E?logo=nestjs)](https://nestjs.com)
[![Frontend](https://img.shields.io/badge/frontend-Vue%203.5-42b883?logo=vue.js)](https://vuejs.org)
[![Database](https://img.shields.io/badge/database-MySQL%208-00758f?logo=mysql)](https://www.mysql.com)

一套**全栈 TypeScript** 智能仓储管理系统（WMS），覆盖仓储核心业务闭环，并内置可对话的「多 Agent 智能助手」。

- **后端**：NestJS 11 + MySQL 8，单服务承载认证权限、WMS 业务、定时预警与多 Agent（SSE 流式）。
- **前端**：Vue 3.5 + Vite 6 + Tailwind 4 + Pinia，**零第三方 UI 框架**，全部界面来自 `web/src/components` 自研的 `Ds*`（设计系统）+ `Base*`（业务组件）组件库。
- **无 Java / 无 Python / 无 Element Plus**，前后端均为 TypeScript，开箱即用。

---

## 功能特性

- **基础资料**：仓库 → 库区 → 库位三级结构、商品/分类、供应商/客户、结构树。
- **入库管理**：入库草稿 → 提交审核 → 事务过账（库存 + 流水同步）。
- **出库管理**：出库草稿逐行校验可用库存（在库 − 冻结），审核扣减；库存不足整单拒绝。
- **库存作业**：实时库存、库存流水、移库、盘点调整、冻结/解冻登记。
- **库存预警**：每日定时扫描低库存 / 超储 / 临期，落库并提醒。
- **盘点管理**：快照明细、实盘录入、差异自动生成调整单。
- **权限体系**：用户 / 角色 / 菜单管理，JWT 鉴权 + 黑名单退出 + 按角色动态下发菜单。
- **数据看板**：库存概况、出入库趋势、待办单据。
- **多 Agent 助手**：1 位调度主管 + 4 位专家（库存查询 / 单据管理 / 预警分析 / 统计分析），17 个真实数据工具，SSE 流式输出，支持历史会话回放与随时中断。AI 仅能生成草稿，不直接改库存。
- **自研组件库**：46 个 `Ds*` 设计系统组件 + 19 个 `Base*` 业务组件，支持明暗双主题。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | NestJS 11、TypeScript 5、mysql2、bcryptjs、JSON Web Token、LangChain（多 Agent）、class-validator |
| 前端 | Vue 3.5、Vite 6、Tailwind CSS 4、Pinia、vue-router、自研 `Ds*`/`Base*` 组件库 |
| 数据库 | MySQL 8 |
| 部署 | 后端 `ServeStaticModule` 单端口托管前端构建产物 |

---

## 目录结构

```
wms/
├── server/                 NestJS 后端
│   └── src/
│       ├── common/         db（连接池/事务）、单号规则、建表兜底、定时任务
│       └── modules/
│           ├── auth/       JWT 登录、Token 黑名单、按角色动态下发菜单
│           ├── basic/      仓库→库区→库位、商品/分类、供应商/客户、结构树
│           ├── inbound/    入库单（草稿→待审核→已入库，事务过账）
│           ├── outbound/   出库单（草稿逐行校验可用库存，审核扣减）
│           ├── inventory/  实时库存/流水/移库/调整/冻结/预警 + 单据查询
│           ├── check/      盘点单（快照明细、实盘录入、差异生成调整单）
│           ├── dashboard/  库存概况、出入库趋势、待办单据
│           ├── system/     用户/角色/菜单管理
│           └── agent/      LangChain 子智能体 + 17 个数据工具 + SSE + 会话落库
├── web/                    Vue 3 前端
│   └── src/
│       ├── components/     ds/(46 个) + Base*(19 个)，零第三方 UI 依赖
│       ├── layout/         顶部导航 + 动态侧栏 + 面包屑
│       └── views/          看板 / 工作台 / 基础资料 / 出入库 / 库存 / 盘点 / 系统 / AI 对话
├── sql/
│   ├── wms.sql             建库脚本（22+ 张表 + 演示数据 + 菜单）
│   └── demo.sql            近 30 天演示单据（幂等，可选）
├── 图片/                   UI 参考截图（不纳入发布）
├── deploy.sh               一键初始化脚本
├── LICENSE
└── README.md
```

---

## 快速开始

### 前置要求

- Node.js ≥ 18
- MySQL 8（本地或 Docker 均可）
- npm ≥ 9

### 1. 建库

使用本地已安装的 MySQL：

```bash
mysql -uroot -p < sql/wms.sql
# 可选：补充近 30 天趋势演示数据
mysql -uroot -p wms < sql/demo.sql
```

或使用 Docker 一键起库（首次启动自动执行 `sql/wms.sql` 建表并写入演示数据）：

```bash
docker compose up -d
```

### 2. 启动后端

```bash
cd server
cp .env.example .env      # 按需填写 DB_*；DEEPSEEK_API_KEY 留空 = 规则兜底模式
npm install
npm run start:dev         # http://localhost:3000/api
```

### 3. 启动前端（开发模式）

```bash
cd web
npm install
npm run dev               # http://localhost:5173（/api 代理到 3000）
```

### 一键初始化

执行下面脚本即可完成「建库 + 生成 `.env` + 前后端依赖与构建」：

```bash
./deploy.sh                 # 基础初始化
WITH_DEMO=1 ./deploy.sh     # 追加趋势演示数据
```

### 演示账号

| 账号 | 角色 | 说明 |
| --- | --- | --- |
| `admin` | 管理员 | 进入首页看板，拥有全部权限 |
| `keeper` | 仓库管理员 | 进入专属工作台，无系统管理权限 |
| `viewer` | 只读访客 | 仅 4 项菜单（首页 / 实时库存 / AI / 工作台） |

密码统一为 `admin123`。

---

## 配置说明

后端配置位于 `server/.env`（由 `.env.example` 复制），字段如下：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 后端监听端口 | `3000` |
| `DB_HOST` / `DB_PORT` | 数据库地址 / 端口 | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` | 数据库账号 / 密码 | `root` / `root` |
| `DB_NAME` | 数据库名 | `wms` |
| `JWT_SECRET` | JWT 签名密钥 | `wms-secret` |
| `JWT_EXPIRES` | Token 有效期 | `24h` |
| `DEEPSEEK_API_KEY` | 大模型 API Key，**留空则启用规则兜底模式**（不调用大模型，直接查库） | 空 |
| `LLM_BASE_URL` / `LLM_MODEL` | OpenAI 兼容接口地址 / 模型名 | `https://api.deepseek.com/v1` / `deepseek-chat` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | 兼容旧键名，二选一即可 | 空 |

> 规则兜底模式：在未配置任何大模型 API Key 的情况下，多 Agent 助手仍可基于真实库表完成查询类问答，不会因缺少 Key 而完全不可用。

---

## 生产部署

后端 `ServeStaticModule` 会托管前端构建产物 `web/dist`，**单端口**即可同时提供页面与 API：

```bash
# 1. 构建前端
cd web && npm install && npm run build

# 2. 构建并启动后端（自动托管 web/dist）
cd server && npm install && npm run build && npm run start
```

启动后访问 `http://localhost:3000` 即可（API 仍在 `/api` 路径下）。

---

## 多 Agent 智能助手

- **架构**：1 位调度主管 + 4 位专家（库存查询 / 单据管理 / 预警分析 / 统计分析）。专家作为主管的工具被调用，各自上下文隔离，17 个数据工具直查真实库表。
- **流式输出**：SSE 事件 `session / step / table / delta / done`，前端按 JSON 内 `type` 分发；步骤时间线实时滚动，完成后折叠为「已协同 N 位专家 · M 次工具调用 · X.Xs」，历史会话按 `message_id` 完整回放。
- **会话落库**：`ai_session / ai_message / ai_step` 三张表，服务重启后上下文照常续聊；支持随时中断（`AbortController` + 服务端 `res.on('close')`）。
- **写操作边界**：AI 只能生成 `status=0` 的入库 / 出库草稿；出库草稿逐行校验目标库位可用量，不足整单拒绝。AI 永不直接改库存表，草稿仍需人工审核生效。

---

## 业务模型

- **单据状态**：`0 草稿 → 1 待审核 → 2 已完成 → 3 已作废`。
- **单号规则**：`RK（入库）/ CK（出库）/ YD（移库）/ TZ（调整）/ PD（盘点）/ DJ（冻结） + yyyyMMdd + 4 位流水`。
- **业务闭环**：基础资料三级结构 → 入库 / 出库草稿 → 提交审核 → 事务过账（库存 + 流水同步）→ 移库 / 调整 / 盘点 / 冻结解冻 → 低库存·超储·临期预警（每日定时扫描）→ 首页看板（库存概况、7/30 天趋势、待办单据）→ 用户 / 角色 / 菜单权限（JWT + 黑名单退出 + 动态菜单）。

---

## 后端 API 概览

所有接口统一前缀 `/api`。受保护接口需在请求头携带 `Authorization: Bearer <token>`。

| 模块 | 前缀 | 主要能力 |
| --- | --- | --- |
| 认证 | `/api/auth` | 登录、登出（黑名单）、个人信息 |
| 基础资料 | `/api/basic` | 仓库 / 库区 / 库位 / 商品 / 分类 / 供应商 / 客户 / 结构树 |
| 入库 | `/api/inbound` | 入库单列表、草稿、审核过账、删除 |
| 出库 | `/api/outbound` | 出库单列表、草稿、可用量校验、审核扣减 |
| 库存 | `/api/inventory` | 实时库存、流水、移库 / 调整 / 冻结作业、预警、单据查询与详情 |
| 盘点 | `/api/check` | 盘点单、快照明细、实盘录入、差异调整单 |
| 看板 | `/api/dashboard` | 库存概况、出入库趋势、待办单据 |
| 系统 | `/api/system` | 用户 / 角色 / 菜单的增删改查与分配 |
| AI | `/api/ai` | 多 Agent 对话（SSE）、会话 / 消息 / 步骤 |

> 完整接口与字段定义请参考源码 `server/src/modules/*/controller.ts` 与 `web/src/utils/request.ts`。

---

## 前端组件库

前端不使用任何第三方 UI 框架，界面全部由自研组件构建。组件库的详细用法、清单、主题令牌与工具函数见 [`web/src/components/README.md`](web/src/components/README.md)。

要点：

- **46 个 `Ds*` 设计系统组件**：按钮 / 表单 / 数据展示 / 导航 / 反馈 / 对话。
- **19 个 `Base*` 业务组件**：配置化表单、数据表格、查询抽屉、上传等。
- **主题令牌**：`--ds-brand`、`--ds-bg`、`--ds-text` 等，支持明暗双主题，遵循 A 股涨跌习惯（涨红跌绿）。

---

## 贡献

欢迎 Issue、PR 与建议！贡献流程与规范请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
