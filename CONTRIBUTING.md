# 贡献指南

感谢你考虑为智能仓储 WMS 系统做出贡献！本文档说明参与协作的基本流程与约定。

## 行为准则

请保持友好、尊重与包容。我们欢迎任何建设性的 Issue、讨论与代码贡献。

## 如何开始

1. Fork 本仓库到你的 GitHub 账号。
2. 克隆你的 Fork 到本地。
3. 参考 [README.md](README.md) 的「快速开始」完成本地环境搭建。

## 分支策略

- `main`：稳定可发布分支，请勿直接推送。
- 功能 / 修复请在本地基于最新 `main` 新建分支：
  - 新功能：`feature/简短描述`
  - 缺陷修复：`fix/简短描述`
  - 文档：`docs/简短描述`

## 提交规范

提交信息建议使用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：

```
feat(server): 新增出库可用量校验
fix(web): 修复实时库存详情无法打开
docs: 完善 README 部署章节
```

常用前缀：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`。

## 开发约定

- **后端**：TypeScript + NestJS 风格；新增业务模块请在 `server/src/modules` 下按现有结构组织；SQL 与建表字段需与 `sql/wms.sql` 保持一致。
- **前端**：Vue 3 `<script setup>` + TypeScript；**优先复用 `Ds*` / `Base*` 自研组件**，不引入 Element Plus 等第三方 UI 框架。
- **数据库变更**：涉及表结构 / 演示数据修改时，请同步更新 `sql/wms.sql` 与 `sql/demo.sql`（保持幂等）。

## 提交 Pull Request

1. 确保你的分支已 `rebase` 到最新的 `main`。
2. 在 PR 中清晰描述：解决的问题、改动范围、本地验证方式。
3. 关联相关 Issue（如 `Closes #123`）。
4. 提交前请自测：
   - 后端：`npm run build`（或 `npx tsc --noEmit`）无错误。
   - 前端：`npm run build` 无错误。

## 反馈问题

发现 Bug 或有功能建议，欢迎提交 Issue，并尽量包含：

- 复现步骤 / 预期与实际表现
- 环境信息（Node / MySQL 版本、操作系统）
- 相关日志或截图

再次感谢你的参与！
