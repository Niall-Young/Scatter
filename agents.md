# Scatter Agent 说明

更新时间：2026-05-02

这份文件给后续参与 Scatter 的 AI agent 使用，记录项目概况、命令、目录、约定和容易踩坑的位置。修改架构、命令或协作规则时要同步更新。

## 项目概况

Scatter 是一个本地 Electron 桌面应用，用任务画布把节点、附件和连线关系转换成结构化 Codex 提示词。项目数据保存在用户选择的本地文件夹 `.scatter` 目录中，附件会复制到 `.scatter/assets`，运行时把生成的 Markdown 和图片输入发送给 Codex Desktop。

主要技术栈：

- Electron 39 + Electron Vite。
- React 19 + TypeScript。
- React Flow 作为画布。
- Zustand 管理 renderer 状态。
- Radix UI 用于 dropdown 和 switch。
- 本地 SVG 图标注册在 `src/renderer/src/components/ui/icon.tsx`。

## 常用命令

从仓库根目录运行：

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

代码改动至少运行 `npm run typecheck`。涉及 UI 或交互时，运行 `npm run dev` 并手动验证相关流程。

## 目录地图

- `package.json`：脚本和依赖。
- `electron.vite.config.ts`：main、preload、renderer 构建入口。
- `tsconfig.json`：严格 TypeScript 配置。
- `src/shared/types.ts`：main、preload、renderer 共享的数据契约。
- `src/main/index.ts`：Electron 启动和 IPC 注册。
- `src/main/projectStore.ts`：项目文档、最近项目、附件持久化。
- `src/main/codexBridge.ts`：Codex Desktop 集成。
- `src/preload/index.ts`：类型化的 `window.scatter` API。
- `src/renderer/src/App.tsx`：renderer 顶层逻辑。
- `src/renderer/src/store/scatterStore.ts`：Zustand 状态和 mutator。
- `src/renderer/src/lib/markdown.ts`：执行范围遍历和 Markdown 生成。
- `src/renderer/src/components`：业务组件。
- `src/renderer/src/components/ui`：共享 UI primitive。
- `src/renderer/src/styles/app.css`：设计 token 和样式。

## 编辑约定

- 不要覆盖用户已有改动；这个仓库可能有未提交的无关修改。
- 改动范围尽量贴近当前请求。
- 数据契约变化优先改 `src/shared/types.ts`。
- Renderer 不直接使用 Node API，需要通过 preload IPC 调 main process。
- 项目数据默认保留在用户选择的本地项目文件夹里。
- 持久化 schema 尽量保持向后兼容；缺失字段在 `projectStore.ts` hydrate 时补齐。
- 新 UI 样式优先复用现有 CSS 变量和组件 primitive。
- UI 文案保持中文优先。
- 图标优先使用现有 `Icon` 名称；需要新增时放到 `src/renderer/src/assets/icons`。

## 常见改动路径

数据模型变化：

- 更新 `src/shared/types.ts`。
- 更新 `src/main/projectStore.ts` 的默认值和 hydrate 逻辑。
- 更新 `src/renderer/src/store/scatterStore.ts`。
- 更新 `src/renderer/src/App.tsx` 中的保存和加载使用方式。
- 如果影响 Codex 上下文，更新 `src/renderer/src/lib/markdown.ts`。
- 同步更新 `design.md` 和 `agents.md`。

新增 IPC 能力：

- 在 `src/main/index.ts` 注册 handler。
- 在 main process 模块中实现需要权限的逻辑。
- 在 `src/preload/index.ts` 暴露类型化方法。
- 必要时更新 renderer 全局类型声明。
- Renderer 只能通过 `window.scatter` 调用。

Markdown 或执行范围变化：

- 从 `src/renderer/src/lib/markdown.ts` 开始。
- 同时验证 `flow` 和 `node` 两种模式。
- 检查环形 flow 的行为。
- 确保附件路径对 Codex 仍然明确可用。

Codex 启动行为变化：

- 从 `src/main/codexBridge.ts` 开始。
- 除非明确替换，否则保留 desktop proxy 和 UI fallback 两条路径。
- 注意 AppleScript fallback 依赖 macOS 辅助功能权限。
- 保持 `cwd` 指向当前项目文件夹。

视觉改动：

- 优先从 `src/renderer/src/styles/app.css` 调整。
- 复用 `Button`、`Switch`、`Icon`。
- 保持界面紧凑、工具型。
- 验证欢迎页、画布、任务节点、右侧抽屉和深色模式。

## 需要保留的当前行为

- 打开或创建文件夹时初始化 `.scatter/scatter.json` 和 `.scatter/assets`。
- 最近项目保存在 Electron `userData`，不是每个项目里。
- 节点和连线变化后会短防抖自动保存。
- 附件先复制到项目目录，再挂到节点上。
- 双击附件项会在 Finder 中显示文件。
- 计划模式只改变发送给 Codex 的 prompt，不改变本地文档结构。
- `flow` 模式包含下游节点；`node` 模式只包含当前节点。
- Markdown 导出会复制当前生成结果到剪贴板。

## 已知风险和空缺

- 文档 schema 里有 viewport，但 React Flow 视口还没实际持久化。
- 还没有附件移除和 asset 清理。
- 暂无针对项目持久化或 Markdown 遍历的自动化测试。
- Codex UI fallback 依赖 macOS Accessibility 权限。
- 当前是桌面应用最小尺寸设计，不是响应式移动网页。

## 文档维护规则

当产品行为或架构变化时：

- 更新 `design.md`：产品、架构、数据和流程变化。
- 更新 `agents.md`：命令、约定、目录导航和协作规则变化。
- 两份文档都优先记录已经存在或明确决定的内容，避免写太多猜测。
