# Scatter

## 中文

Scatter 是一个本地优先的 Electron 桌面应用，用任务画布把节点、附件和连线关系整理成结构化 Codex 提示词。项目数据保存在用户选择的本地文件夹中，附件会复制到项目内的 `.scatter/assets`，运行时可将生成的 Markdown 和图片输入发送给 Codex Desktop。

### 功能

- 本地文件夹即项目，项目数据默认不上传云端。
- 使用 React Flow 画布创建、连接、移动和复制任务节点。
- 节点支持标题、正文、附件、计划模式、推理强度和运行范围设置。
- 支持只运行当前节点，或运行当前节点及下游子节点。
- 根据节点和连线生成可预览、可复制、可下载的 Markdown。
- 支持最近项目、项目搜索、设置弹窗、浅色/深色主题和中英文界面。
- 支持撤销/重做、快捷键、拖拽/粘贴附件和 Codex Desktop 启动。

### 技术栈

- Electron 39 + Electron Vite
- React 19 + TypeScript
- React Flow
- Zustand
- Radix UI

### 开发

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run typecheck
npm run build
npm run preview
```

代码改动至少运行：

```bash
npm run typecheck
```

### 项目数据

打开或创建项目时，Scatter 会在用户选择的文件夹中初始化：

```text
<project>/
  .scatter/
    scatter.json
    assets/
```

- `scatter.json` 保存节点、连线、项目名和基础视口信息。
- `assets/` 保存复制进项目的附件。
- 最近项目和应用设置保存在 Electron `userData`，不写入每个项目文件夹。

### 注意事项

- 当前主要面向 macOS 桌面端。
- Codex Desktop UI fallback 依赖 macOS 辅助功能权限。
- 视口 schema 已存在，但 React Flow 视口尚未完整持久化。
- 暂无附件清理和完整自动化测试覆盖。

## English

Scatter is a local-first Electron desktop app that turns task nodes, attachments, and graph relationships into structured prompts for Codex. Project data is stored inside a local folder selected by the user, attachments are copied into `.scatter/assets`, and the generated Markdown plus image inputs can be sent to Codex Desktop.

### Features

- Local folders act as projects, with project data kept off the cloud by default.
- Create, connect, move, and duplicate task nodes on a React Flow canvas.
- Configure each node with a title, body, attachments, plan mode, reasoning effort, and run scope.
- Run only the current node, or run the current node together with downstream child nodes.
- Generate Markdown that can be previewed, copied, or downloaded.
- Includes recent projects, project search, settings, light/dark themes, and Chinese/English UI.
- Supports undo/redo, keyboard shortcuts, drag-and-drop/paste attachments, and Codex Desktop launch integration.

### Tech Stack

- Electron 39 + Electron Vite
- React 19 + TypeScript
- React Flow
- Zustand
- Radix UI

### Development

```bash
npm install
npm run dev
```

Common commands:

```bash
npm run typecheck
npm run build
npm run preview
```

Run at least the following after code changes:

```bash
npm run typecheck
```

### Project Data

When a project is opened or created, Scatter initializes the following structure in the selected folder:

```text
<project>/
  .scatter/
    scatter.json
    assets/
```

- `scatter.json` stores nodes, edges, the project name, and basic viewport data.
- `assets/` stores attachments copied into the project.
- Recent projects and app settings live in Electron `userData`, not inside each project folder.

### Notes

- Scatter currently targets the macOS desktop experience.
- The Codex Desktop UI fallback requires macOS Accessibility permissions.
- The viewport schema exists, but React Flow viewport persistence is not fully implemented yet.
- Attachment cleanup and broad automated test coverage are not yet implemented.
