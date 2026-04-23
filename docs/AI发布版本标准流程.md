# AI 版本发布标准流程（copilot-api）

## 用途

本文用于约束 AI 在 `copilot-api` 仓库内执行版本发布时的固定流程。

当用户说出类似下面的话时，可直接引用本文执行：

- `发布 3.0 版本`
- `发 3.0.0`
- `继续发 2.3.0`
- `按本文发版`
- `调用 github cli 发布 3.0 版本`

AI 必须基于真实仓库状态、真实 git 输出、真实 GitHub Release 返回结果执行，不允许猜测流程。

---

## 本项目发布规则

1. 仓库固定为：`QLHazyCoder/copilot-api`
2. 默认分支固定为：`main`
3. 版本号来源固定为：`package.json` 的 `version`
4. 版本格式固定为三段式 semver：`x.y.z`
   - 用户说 `3.0` 时，标准化为 `3.0.0`
   - 用户说 `2.3` 时，标准化为 `2.3.0`
5. Git tag 与 GitHub Release 标题统一直接使用版本号本身，例如：`3.0.0`
6. 本项目 Docker 发布依赖 tag 触发，`.github/workflows/release-docker.yml` 当前匹配规则为：`*.*.*`
7. 发布前必须确认：
   - 当前位于 `main`
   - 本地已 fast-forward 到 `origin/main`
   - 工作区里只有本次发版相关改动
8. Release 正文需要基于“上一个正式 Release 到当前 HEAD”的真实差异编写
9. 发布完成后必须复检线上 Release：tag、标题、正文、链接都要正确
10. 默认不额外编译、不额外跑测试，除非用户单独要求

---

## 版本标准化规则

### 允许自动标准化的输入

- `3` -> `3.0.0`
- `3.0` -> `3.0.0`
- `2.3` -> `2.3.0`
- `2.3.4` -> `2.3.4`

### 不允许猜测的情况

如果用户输入不是可无歧义转换的 semver，例如：

- `vNext`
- `正式版`
- `下个版本`

则不能猜。

---

## 固定检查步骤

### 1. 检查仓库状态

必须先执行：

```bash
git status --short --branch
git remote -v
git branch --show-current
```

要求：

- 当前分支必须是 `main`
- 如果本地落后 `origin/main`，必须先执行：

```bash
git pull --ff-only origin main
```

- 如果存在无法确认归属的改动，必须先停下来，不允许擅自一起发版

### 2. 读取当前版本号

必须从 `package.json` 真实读取：

```bash
python - <<'PY'
import json
from pathlib import Path
pkg = json.loads(Path('package.json').read_text(encoding='utf-8'))
print(pkg['version'])
PY
```

要求：

- 目标版本必须大于当前版本
- 本项目不使用 `Pro1.0` / `version_name` / `manifest.json` 体系

### 3. 检查目标版本是否已存在

必须同时检查：

```bash
git tag --list <version>
gh release view <version> -R QLHazyCoder/copilot-api
```

规则：

- 如果 GitHub Release 已存在该版本，不能重复创建
- 如果本地 tag 已存在但 Release 不存在，要先确认历史状态，再决定是补 Release 还是停止

---

## Release 文案生成规则

### 1. 以上一个正式 Release 为起点

先查看最近 Release：

```bash
gh release list -R QLHazyCoder/copilot-api --limit 10
```

默认以上一个正式 Release 作为差异分析起点，例如：

```bash
git log --oneline 2.2.0..HEAD
git diff --stat 2.2.0..HEAD
git diff --name-only 2.2.0..HEAD
```

### 2. 文案必须基于真实差异

正文必须概括真实功能点，例如：

- 新路由能力
- 新配置能力
- 管理页改动
- 运行时行为变化
- 测试补充

禁止：

- 写不存在的功能
- 写临时调试项
- 用空泛文案替代真实变更

### 3. 文案文件位置

本项目可将 Release 草稿写入：

```text
docs/release版本文案/release-notes-<version>.md
```

注意：

- `docs/**/*.md` 当前被 `.gitignore` 忽略
- 新建的 release notes 草稿通常用于 `gh release create --notes-file`，默认**不需要提交入库**
- 已被 git 跟踪的文档仍然可以正常修改和提交

---

## 标准发布步骤

### 阶段 1：生成发布内容

1. 拉取最新 `main`
2. 确认工作区状态
3. 获取上一个正式 Release
4. 基于真实 diff 编写 Release 文案

### 阶段 2：更新版本号并提交

修改：

- `package.json` 中的 `version`

提交信息统一使用：

```text
chore(release): prepare <version>
```

示例：

```bash
git add package.json
git commit -m "chore(release): prepare 3.0.0"
```

如果本次发版还包含用户明确要求一起提交的已跟踪文档修改，也应一并加入同一个提交。

### 阶段 3：推送 main

```bash
git push origin main
```

### 阶段 4：创建并推送 tag

使用注释 tag：

```bash
git tag -a 3.0.0 -m "release 3.0.0"
git push origin 3.0.0
```

### 阶段 5：创建或更新 GitHub Release

创建：

```bash
gh release create 3.0.0 \
  -R QLHazyCoder/copilot-api \
  --title "3.0.0" \
  --notes-file docs/release版本文案/release-notes-3.0.0.md
```

如果 Release 已存在但需要修正文案：

```bash
gh release edit 3.0.0 \
  -R QLHazyCoder/copilot-api \
  --title "3.0.0" \
  --notes-file docs/release版本文案/release-notes-3.0.0.md
```

---

## 发布后复检

发布完成后，必须执行：

```bash
git status --short --branch
git log --oneline --decorate -n 5
gh release view 3.0.0 -R QLHazyCoder/copilot-api
```

必须核对：

1. `main` 已推送到远端
2. tag 已存在远端
3. Release 标题正确
4. Release 正文不是空的
5. Release 正文没有乱码
6. Release 链接可返回

---

## GitHub CLI 说明

本项目默认直接使用 `gh`。

如果用户机器是 Windows 且当前终端 PATH 没刷新，可参考：

- `.github/GitHub-CLI-固定路径与直接执行规范.md`

但这属于命令执行环境问题，不改变本项目的发版逻辑。

---

## 禁止事项

- 不得把其他项目的 `manifest.json` / `Pro1.0` / `master + dev 双推送` 流程照搬到本项目
- 不得跳过 `origin/main` 同步检查
- 不得在 Release 已存在时重复创建同名 Release
- 不得在没有真实 diff 分析的情况下编造更新说明
- 不得在发版完成后省略线上复检
