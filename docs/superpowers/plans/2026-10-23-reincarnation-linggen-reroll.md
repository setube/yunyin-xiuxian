# 转生不限次重刷灵根 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 每次转生可预览并不限次重刷灵根，确认后采用最后牌面。

**Architecture:** 转生视图保存 nextLinggen 与该次结算的资质加成；核心服务负责重刷，Vue 仅展示并调用。沿用现有结算与存档结构。

**Tech Stack:** Vue 3、Pinia、TypeScript、Vitest、Bun。

**Spec:** docs/superpowers/specs/2026-10-23-reincarnation-linggen-reroll-design.md

## Global Constraints

不限次；保留资质保底；不重抽天赋、不重复发放转生奖励；不新增持久化字段。

## Review Focus

初次建角保持原样；手动与寿尽入口共用；高宿慧资质封顶；天赋抽空仍能确认；重复确认不重复发奖。

### Task 1: 转生草稿、重刷与交割

**Files:** src/stores/ui.ts、src/core/reincarnation.ts、src/core/reincarnation.flow.spec.ts、src/components/character/ReincarnationDialog.vue、CHANGELOG.md。

**Interfaces:** prepareReincarnation(): ReincarnationView 生成 nextLinggen；rerollReincarnationLinggen(): void 只替换草稿；confirmReincarnation() 使用草稿。

- [x] 先在现有 flow spec 添加行为测试：预览不改变持久化状态、连续重刷 50 次不改变奖励或天赋、确认采用预览、资质按结算后宿慧且封顶、重复确认无副作用。
- [x] 运行 bun run test src/core/reincarnation.flow.spec.ts，确认新增测试因功能缺失失败。
- [x] 最小实现视图字段、服务与转生第二程卡片，更新 Unreleased。
- [x] 运行全量 bun run test、bun run check、bun run build；浏览器验证手动及寿尽转生、重刷和确认结果。首次建角沿用原实现与既有 game 测试。
- [x] 检查 diff，按仓库中文 Conventional Commit 规范提交并推送 fork 功能分支。
