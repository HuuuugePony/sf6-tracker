# SF6 Tracker - 街霸6对战记录追踪器

一个用于追踪和分析《街头霸王6》对战记录的 Web 应用程序。支持查看战绩、玩家信息查询、角色胜率分析等功能。

## 功能特性

- **战绩查看**：查看最近的对战记录，包括胜负、角色、LP变化等
- **玩家查询**：搜索并查看其他玩家的战绩数据
- **角色胜率**：分析各角色对阵胜率统计
- **趋势图表**：LP/MR 变化趋势可视化
- **收藏功能**：收藏常用玩家，支持备注编辑
- **主题切换**：支持亮色/暗色主题
- **桌面应用**：可作为独立桌面应用运行

## 技术栈

- **后端**：FastAPI + Uvicorn
- **前端**：原生 HTML/CSS/JavaScript
- **爬虫**：Requests + Pandas
- **桌面端**：pywebview
- **登录**：Selenium (Edge)

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd sf6-tracker

# 安装依赖
pip install -r requirements.txt
```

## 运行方式

### 方式一：桌面应用（推荐）

```bash
python desktop_app.py
```

将启动原生桌面窗口，无需打开浏览器。

### 方式二：Web 服务

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

然后在浏览器中访问 `http://localhost:8000`

## 使用说明

1. 启动应用后，点击右上角"登录"按钮
2. 在弹出的浏览器中登录 CAPCOM 账号
3. 登录成功后点击"获取用户信息"
4. 系统将自动获取并展示你的对战记录

## 项目结构

```
sf6-tracker/
├── crawler.py           # 爬虫核心逻辑
├── main.py              # FastAPI Web 服务
├── desktop_app.py       # 桌面应用入口
├── index.html           # 前端页面
├── desktop_styles.css   # 桌面端样式
├── requirements.txt     # Python 依赖
├── sf6tracker.spec      # PyInstaller 打包配置
├── build.bat            # Windows 打包脚本
└── README.md            # 项目说明
```

## 打包为 EXE

运行打包脚本：

```bash
build.bat
```

或手动执行：

```bash
pip install pyinstaller
pyinstaller --clean sf6tracker.spec
```

打包完成后，可执行文件位于 `dist/SF6Tracker.exe`。

**注意**：打包后的 EXE 包含所有依赖，可直接在任何 Windows 电脑上运行，无需安装 Python 或其他依赖。

## 版本

v0.1

## License

MIT
