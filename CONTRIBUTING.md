# 开发与 Git 规范

## 界面边界

现有在线页面的数据内容和布局是基准。修复稳定性、拆分内部代码或新增本地能力，不应顺带调整信息顺序、折叠状态、卡片布局和筛选控件。视觉变化先确认范围，再提供前后对照。

本地历史只按被查询玩家保存；不增加“哪个账号查了谁”的模型或登录账号切换。新功能优先复用已有按钮、间距、颜色和交互。

## 分支

- `main`：已验收、可发布，不进行日常开发。
- `develop`：日常开发和集成，提交前完成对应测试。
- 不重写已共享历史，不默认强推。发布时把已验收的 `develop` 合入 `main`，用版本标签标记发布点。
- 本规范不自动提交工作区或推送远端。脏工作区切换分支，不意味着改动已保存到提交中。

正常发布时，先保证工作区干净且验收完成：

```powershell
git switch main
git merge --no-ff develop
# 按实际版本打标签，例如：git tag -a v0.7 -m "Release v0.7"
git switch develop
git merge main
```

### 从远端 master 迁移

本地改名不会更改 GitHub 默认分支。仓库管理员确认迁移时再执行：

```powershell
git push -u origin main
git push -u origin develop
```

随后在 GitHub 将默认分支设为 `main`，检查 CI / 发布脚本中的 `master` 引用，并设置分支保护：`main` 禁止强推与删除，合入前要求测试通过。多人协作时通过 PR 合入。旧远端 `master` 先保留，迁移完成后再决定是否删除。

## 提交格式

使用 `type(scope): 中文说明`，例如：

```text
feat(history): 按玩家保存本地战绩
fix(auth): 忽略已取消的登录响应
refactor(frontend): 拆分请求处理，保持界面不变
docs(readme): 更新本地运行说明
test(history): 覆盖旧数据库迁移
chore(git): 排除运行缓存和账号文件
```

允许类型：`feat`、`fix`、`refactor`、`perf`、`docs`、`test`、`build`、`ci`、`chore`、`revert`。`scope` 可省略；说明须表达目的，避免“优化一下”“更新”等标题。破坏兼容时在正文说明影响与迁移步骤。

一次提交解决一个问题，相关实现和测试一起提交。不把界面、重构、数据迁移和文档都塞进大提交，也不为拆分留下无法运行的中间状态。

## 提交前检查

1. `git status --short`：只包含本次修改，不混入账号文件、玩家信息、日志、缓存、数据库或构建产物。
2. 按文件或补丁暂存：`git add -- <明确路径>` 或 `git add -p`，避免未经检查的 `git add .`。
3. `git diff --cached --check` 与 `git diff --cached`：检查最终内容，不传播真实凭据。
4. 后端运行 `python -m unittest discover -s tests -v`；前端逻辑运行 `node --test tests/frontend_reliability.test.js`。
5. 界面修改检查最小桌面窗口、主题和原有在线流程；归档修改检查重复同步、断网、重启和数据库兼容；打包配置修改另行验收 EXE。

当前格式以文档约定，不修改全局 Git 配置，也不自动安装钩子。测试目录只允许已知回归代码和说明，其他文件仍默认忽略，避免测试账号意外纳入版本管理。
