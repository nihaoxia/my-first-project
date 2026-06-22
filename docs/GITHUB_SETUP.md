# Stray Pages GitHub 准备说明

本文档记录 Stray Pages 后续提交到 GitHub 前需要完成的准备事项和约定。

## 当前状态

- 项目目录已经添加 `.gitignore`。
- 技术栈文档已拆分到 `docs/TECH_STACK.md`。
- 开发日志已拆分到 `docs/DEV_LOG.md`。
- 本地 Git 仓库已初始化。
- 默认分支为 `main`。
- 当前尚未配置 GitHub 远程仓库。

## 需要用户提供的事项

需要在 GitHub 上创建一个空仓库，并提供仓库地址。

地址格式可以是 HTTPS 或 SSH：

```text
https://github.com/<user-or-org>/<repo>.git
git@github.com:<user-or-org>/<repo>.git
```

## 配置 GitHub 远程仓库

等 GitHub 上创建空仓库后，配置远程地址并推送：

```powershell
git remote add origin <GitHub 仓库地址>
git push -u origin main
```

## 开发提交约定

- 每完成一个独立功能，提交一次。
- 每修复一个重要问题，提交一次。
- 每次提交前更新 `docs/DEV_LOG.md`。
- 技术栈或架构决策发生变化时，同时更新 `docs/TECH_STACK.md`。
- 不提交 `.env`、依赖目录、构建产物、本地缓存和工具生成的临时文件。

## 建议提交信息格式

```text
feat: add book upload flow
fix: correct chapter parsing edge case
docs: update development log
chore: configure project tooling
refactor: extract translation task service
```

第一版开发期间可以保持英文提交信息，便于 GitHub 和自动化工具识别。
