# Arthas Docs uTools Plugin

![Arthas Logo](images/arthas-logo.png)

## 📖 项目介绍

Arthas Docs uTools Plugin 是一个基于 [uTools](https://u.tools/) 平台的插件，为 Java 开发者提供了 [Alibaba Arthas](https://arthas.aliyun.com/) 诊断工具的离线文档查询功能。该插件集成了 Arthas 4.0.4 版本的完整文档，让开发者能够随时随地查阅 Arthas 的命令用法、功能特性和使用案例，无需联网即可获取所需信息。

Arthas 是阿里巴巴开源的 Java 应用诊断工具，广泛应用于线上问题排查、性能分析和系统监控。本插件旨在提高开发者使用 Arthas 的效率，通过优化的界面和便捷的文档访问方式，帮助用户快速掌握 Arthas 的各项功能。

## ✨ 主要特性

- **完整文档集成**：包含 Arthas 4.0.4 版本的全部命令和功能文档
- **离线使用**：无需网络连接，随时查阅文档
- **优化的阅读体验**：
  - 响应式设计，适配不同屏幕尺寸
  - 代码块语法高亮
  - 自动文本换行，提高可读性
  - 表格内容优化显示
- **快速检索**：通过 uTools 关键词 "arthas"、"docs" 或 "java诊断" 快速启动
- **暗黑模式支持**：自动适配系统主题设置
- **界面交互优化**：
  - 可调整侧边栏宽度
  - 命令分类清晰展示
  - 文档内容格式优化

## 🔧 技术架构

### 核心组件

1. **前端界面**：
   - HTML5 + CSS3 构建的响应式界面
   - 纯 JavaScript 实现的交互逻辑，无框架依赖
   - 分离的侧边栏和内容区域设计

2. **文档处理**：
   - 使用 Marked.js 解析 Markdown 文档
   - 自定义渲染器增强代码块显示
   - 文档内容动态加载机制

3. **uTools 集成**：
   - 基于 uTools 插件 API 开发
   - 利用 Node.js 能力读取本地文件
   - 插件生命周期管理

### 文件结构

```
arthas/
├── docs/                 # Arthas 文档 Markdown 文件
├── scripts/              # 构建 / 文档格式规范化脚本
│   ├── normalize-md.js   # 统一修复 docs/*.md 的格式问题（运行时被 preload 复用）
│   └── build.js          # 生成干净的发布目录 .dist/（排除 .git 等）
├── index.html            # 主界面 HTML
├── index.js              # 主要 JavaScript 逻辑
├── style.css             # 样式表
├── preload.js            # uTools 预加载脚本（marked 渲染器 / 代码高亮）
├── plugin.json           # 插件配置文件
├── docs-list.json        # 文档列表和描述
├── docs-group.json       # 文档分组
├── images/               # 文档里引用的图片
│   └── arthas-logo.png   # Arthas 原始横版 Logo（README 展示用）
├── logo.png              # 插件图标（256x256 正方形，发布要求）
├── package.json          # 项目依赖配置
└── README.md             # 项目说明文档
```

### 文档格式规范

`docs/*.md` 由 Arthas 官方文档页面转换而来，历史上累积了不少转换痕迹（标题锚点、被压平的提示块、丢失的表格内联代码、缺失的代码块语言标注等）。

`scripts/normalize-md.js` 负责把这些内容统一整理成规范 Markdown，并在 `preload.js` 中复用，保证「磁盘上的文档」和「实际渲染结果」一致：

```bash
npm run normalize   # 就地修复 docs/*.md
npm run check       # 只检查是否存在格式差异（有差异时退出码为 1）
```

> ⚠️ `scripts/normalize-md.js` 会被 `preload.js` 直接 `require`，因此**不要给它加 `#!` shebang**：
> uTools 的 preload 运行在 Electron 的 vm 中，其模块加载器不会剥掉 shebang，会直接抛
> `SyntaxError: Invalid or unexpected token`，导致整个插件打不开。

规范化的内容包括：

- 移除标题里的锚点残留，如 `## [#](#参数说明) 参数说明` -> `## 参数说明`
- 修复被转换器压平的提示块，统一为 `> **提示**` 形式（渲染时转换为 Callout）
- 修复引用块「懒延续」导致正文被吞进引用的问题
- 修复挤到同一行的列表项、丢失缩进的嵌套列表
- 恢复表格单元格里被吞掉的行内代码（如 `[m <arg>]`）
- 修正代码块语言标注，清理不可见控制字符与全角符号误用
- 统一空行、列表符号和分隔线写法

## 🚀 功能模块

### 1. 文档浏览

- **命令列表**：展示所有 Arthas 命令及其简要描述
- **命令详情**：提供每个命令的详细用法、参数说明和使用示例
- **核心功能**：包含 Arthas 的核心功能文档，如类增强、表达式支持等

### 2. 界面交互

- **侧边栏调整**：可拖动分隔条调整侧边栏宽度
- **文档分组**：按「命令列表 / 其它说明」等分组筛选文档
- **文档导航**：每篇文档顶部自动生成目录，点击即可跳转到对应章节，滚动时高亮当前章节
- **链接处理**：站外链接交给系统浏览器打开，`/doc/xxx.md` 形式的交叉引用直接在插件内切换文档
- **通知系统**：提供操作反馈的通知机制

### 3. 代码展示

- **语法高亮**：支持多种语言的代码高亮显示
- **特殊标记**：对 Arthas 命令、选项等进行特殊标记
- **自适应显示**：代码块水平滚动，保持格式完整性

## 📋 命令列表

插件包含以下 Arthas 命令的详细文档：

| 基础命令 | 类相关 | 方法相关 | 增强相关 | 系统相关 |
|---------|-------|---------|---------|---------|
| help    | sc    | sm      | watch   | dashboard |
| cls     | jad   | trace   | monitor | thread    |
| session | dump  | stack   | tt      | jvm       |
| reset   | mc    |         | profiler| sysenv    |
| version | redefine |      |         | vmoption  |
| quit    | retransform |   |         | sysprop   |
| stop    | classloader |   |         | perfcounter |

此外，还包括 HTTP API、批处理支持、鉴权等高级功能的文档。

## 🔍 使用方法

1. 在 uTools 中安装 Arthas Docs 插件
2. 通过关键词 "arthas"、"docs" 或 "java诊断" 启动插件
3. 在左侧菜单中选择需要查看的命令或功能
4. 在右侧内容区域阅读详细文档

## 🛠️ 开发与构建

### 环境要求

- Node.js 18.0 或更高版本
- uTools 开发者工具

### 安装依赖

```bash
npm install
```

### 开发调试

1. 使用 uTools 开发者工具加载项目目录
2. 修改代码后刷新插件进行测试

### 构建发布包

> ⚠️ uTools 发布要求：**打包目录里不能包含 `.git/`、`.gitignore`、`.vscode/`、`*.js.map` 等版本控制/编辑器文件**（官方 FAQ「发布时的资源清洁」）。
> 官方也明确建议「切勿将整个项目的根目录打包成插件应用」，所以不要直接拿仓库根目录去打包。

```bash
npm run build        # 按白名单生成干净的发布目录 .dist/
npm run build:check  # 只校验已有的 .dist/
```

`scripts/build.js` 会：

1. 只把插件运行时真正需要的文件复制到 `.dist/`（`plugin.json`、入口文件、`docs/`、`images/`、`node_modules/`、`preload.js` 依赖的 `scripts/normalize-md.js` 等）；
2. 顺手排掉 `.git/`、`.gitignore`、`.vscode/`、`.cursor/`、`.trae/`、`.DS_Store`、`*.js.map` 等发布禁止项；
3. 校验产物：禁止文件为零、`plugin.json` 声明的入口都存在、`logo.png` 是正方形、
   `docs-list.json` 与 `docs/` 数量一致、被 `preload.js` `require` 的脚本能在 Electron 加载器下编译。

然后在 uTools 开发者工具里选择 **`.dist/` 目录**进行打包/发布。

> 两个容易踩的坑：
> 1. `preload.js` 运行时会 `require('marked')` 和 `require('./scripts/normalize-md.js')`，
>    所以 `node_modules/` 与 `scripts/normalize-md.js` **必须**跟着打包；
> 2. 被 `require` 的脚本**不能带 `#!` shebang**，uTools 的 preload 加载器不会剥掉它，
>    否则会直接抛 `SyntaxError` 导致插件打不开。

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🔗 相关链接

- [Arthas 官方文档](https://arthas.aliyun.com/doc/)
- [uTools 官网](https://u.tools/)
- [Alibaba Arthas GitHub](https://github.com/alibaba/arthas)

---

**注意**：本插件为非官方 Arthas 文档工具，仅用于学习和参考。如有任何问题，请参考 Arthas 官方文档。
