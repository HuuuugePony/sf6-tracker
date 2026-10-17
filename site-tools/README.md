# SF6 Tracker 静态官网

网页目录是仓库根目录的 `site/`。HTML、CSS、JavaScript 和媒体均为静态文件，不需要 Node 构建、Python 后端或数据库。只部署 `site/` 的内容；`web/` 是桌面应用界面，二者用途不同。

## 本机查看

当前预览：http://127.0.0.1:18766/ 。本机可运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\site-tools\preview.ps1
```

这个启动器复用本机已有宣传片工程的 http-server。换电脑时可在仓库根目录运行：

```powershell
npx http-server site -p 18766 -a 127.0.0.1 -c-1
```

部署包在 `.ui-previews/site/SF6-Tracker-官网静态文件.zip`，解压后顶层为 `index.html`。包内只有可公开的网站文件，不包含产品后端、Cookie 文件、本地历史数据库或 EXE。

## 建议：GitHub Pages

项目源码和下载已经在 GitHub，Pages 适合作为这个开源项目的长期介绍入口。`.github/workflows/deploy-site.yml` 只部署 `site/`，支持手动触发；官网文件或部署配置推送到 `master` 时自动部署。沿用现有只允许 `master` 的环境保护规则，不从版本标签直接部署。

1. 审阅并把 `site/`、`site-tools/` 和工作流合入仓库的默认分支。当前本机 `origin/HEAD` 仍指向 `origin/master`，工作分支为 `develop`；应以仓库实际设置为准，不要假设默认分支已经迁移为 main。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Deploy SF6 Tracker website → Run workflow**，选择包含官网文件的分支。
4. 等工作流完成，使用其返回的实际 URL。使用当前仓库的默认项目域名时，预计形式为 `https://HuuuugePony.github.io/sf6-tracker/`。此地址尚未由本次操作部署或验证，不是已上线声明。

页面所有资源均使用相对路径，支持 `/sf6-tracker/` 子目录。绑定自有域名时，在 Pages 中设置并按平台说明配置 DNS；确认实际域名后再补绝对 canonical 和分享图片 URL。

参考：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 备选：Cloudflare Pages

适合希望独立管理域名和托管，或者先直接上传成品的情况。当前站点约 11 MB，视频约 10 MB，所有单文件均小于 Pages 的 25 MiB 限制。

### 不连接仓库，直接上传

在 Cloudflare Dashboard 的 **Workers & Pages** 创建 Pages 项目，使用 **Direct Upload / Drag and drop** 上传整站 ZIP 或 `site/` 文件夹，确认后部署。平台会返回实际的 `*.pages.dev` 地址。

直接上传项目以后不能原地切换为 Git 集成，需要另建 Git 集成项目，因此若准备长期跟随仓库更新，优先下面的方式。

### 连接当前 GitHub 仓库

- Framework preset：None。
- Root directory：`site`。
- Build command：`exit 0`。
- Build output directory：`.`。
- Production branch：选择已经包含官网文件的稳定分支。

也可以从仓库根目录设置 Root directory 为空，输出目录为 `site`。不要把整个仓库当作公开静态目录。现有 `_headers` 只在支持该格式的平台生效，其他静态服务器可忽略。

参考：[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[限制](https://developers.cloudflare.com/pages/platform/limits/)。

## 已有服务器

把 `site/` 里的文件上传到已有 Nginx / Caddy 的静态目录即可，路径可以是域名根目录或子目录。使用默认 `index.html` 和标准 MIME 类型，保留 MP4 的 Range 请求支持。官网不需要部署 SF6 Tracker 的本机查询服务。

## 内容与素材

v0.8 同步更新官网版本提示、更新摘要与地区功能说明；保留 v0.7 实机截图和短片，明确注明素材版本。备用下载源版本以文件名为准，新版本优先通过 GitHub Releases 获取。

- 主入口：GitHub Releases latest，已经确认公开地址返回成功并重定向到已发布版本；按钮不固定某个 EXE 文件名。
- 备用入口：用户提供的蓝奏云 `https://wwbjc.lanzoum.com/b01i5xh97c`，提取密码 `9osf`。首屏与开始使用区域均显示，支持复制密码；剪贴板不可用时提示手动复制。
- 截图：6 张第四版真实 EXE 原窗口截图，986×793，只转 WebP，不裁切、不拉伸。可点击放大。
- 视频：第四版 45.056 秒成片，另编码为 1600×900、30fps 的网页副本，约 10 MB。原 1080p60 和 4K60 保留在宣传片交付目录。
- 图片展示公开玩家数据，笔记为明确标注的演示内容。本地开发版展示与实际 Releases 说明区分。
- 配乐：Michael Ramir C.《K.O.》，Mixkit 1068。沿用已核对的视频使用授权，原始授权记录在宣传片工程 `out/配乐授权.txt`；不独立发布音乐音轨。
- 字体使用访问设备的系统字体，不向网站复制或分发 Windows 字体文件。标记为自绘 SVG；游戏及相关素材权利归其权利人。
- 网站不收集 Cookie、不连接游戏查询 API、不包含追踪脚本；实际查询在本机产品中完成。

## 修改与检查

- 内容：`site/index.html`。
- 样式及手机适配：`site/styles.css`。
- 功能切换、完整截图弹层、手机导航：`site/app.js`。
- 素材来源：`site-tools/media-sources.json`。
- 媒体生成：`site-tools/prepare-assets.py`；仅在本机存在宣传片交付文件时使用。
- 浏览器验收：`site-tools/check_site.py`，使用本机已有 Playwright 环境与 Chromium。
- 打包：`site-tools/package.py`，需先有成功的浏览器验收记录；只打包 `site/`，并检查大小与凭证内容。

当前验收覆盖1440/1024/768/390/375/320宽度、无横向溢出、原比例截图、手机导航、功能切换、键盘操作、截图弹层、FAQ、视频播放/暂停/拖动以及 HTTP Range 206。结果和截图在 `.ui-previews/site/`。

公开发布由 GitHub Pages 工作流或所选托管平台执行；本地预览和打包命令不会自动触发 Git 提交、推送或部署。
