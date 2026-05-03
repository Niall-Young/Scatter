# Scatter Agent 说明

更新时间：2026-05-03

这份文件给后续参与 Scatter 的 AI agent 使用，记录项目概况、命令、目录、约定和容易踩坑的位置。修改架构、命令或协作规则时要同步更新。

## 项目概况

Scatter 是一个本地 Electron 桌面应用，用任务画布把节点、附件和连线关系转换成结构化 Codex 提示词。项目数据保存在用户选择的本地文件夹 `.scatter` 目录中，附件会复制到 `.scatter/assets`，运行时把生成的 Markdown 和图片输入发送给 Codex Desktop。

主要技术栈：

- Electron 39 + Electron Vite。
- React 19 + TypeScript。
- React Flow 作为画布。
- Zustand 管理 renderer 状态。
- Radix UI 用于 dropdown、dialog 和 switch。
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
- `src/renderer/src/components/SettingsDialog.tsx`：居中设置弹窗。
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
- 图标按钮必须复用 `src/renderer/src/components/ui/icon-button.tsx` 的 `IconButton`，不要在业务组件里手写 icon-only `<button>`。

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

画布撤销/重做变化：

- 从 `src/renderer/src/store/scatterStore.ts` 开始，历史栈只保存在 renderer 内存中。
- 文档编辑使用 `commitCanvasChange`；选中态、hover 等 UI 状态使用 `replaceCanvasLive` 或普通 UI setter。
- 拖拽、文本编辑、粘贴/拖拽自动创建节点这类组合操作用 `beginHistoryTransaction` 和 `commitHistoryTransaction` 合并为一步。
- 不要把 `selected`、抽屉、主题、视口、保存状态或 `data.lastRunAt` 做成撤销历史。
- 左下角撤销/重做按钮必须由 `canUndo`、`canRedo` 控制禁用态；快捷键保持 `Cmd+Z` 和 `Cmd+Shift+Z`。

Codex 启动行为变化：

- 从 `src/main/codexBridge.ts` 开始。
- 除非明确替换，否则保留 desktop proxy 和 UI fallback 两条路径。
- 注意 AppleScript fallback 依赖 macOS 辅助功能权限。
- 保持 `cwd` 指向当前项目文件夹。

视觉改动：

- 优先从 `src/renderer/src/styles/app.css` 调整。
- 复用 `Button`、`Switch`、`Icon`。
- 保持界面紧凑、工具型。
- 左侧栏“设置”按钮打开居中设置弹窗，不要恢复成直接切换主题。
- 验证启动页、欢迎页、画布、任务节点、右侧侧边栏和深色模式。
- 顶部栏左侧的侧栏按钮使用 `IconButton`；展开态显示侧栏收起按钮，收起态显示侧栏展开按钮和添加项目按钮。

画布交互变化：

- 从 `src/renderer/src/App.tsx` 的 React Flow props 开始。
- 缩放必须按住 `Cmd` 加滚轮；不要恢复普通滚轮缩放。
- 手形工具进入画布平移模式；按住空格键临时进入同一平移状态。
- 缩放比例按钮必须打开下拉菜单，提供 50%、75%、100%、150%、200%。
- `Shift` 框选只在框选过程中显示选框；结束后只保留节点选中态，不显示持续存在的群组选框。

## 需要保留的当前行为

- 打开或创建文件夹时初始化 `.scatter/scatter.json` 和 `.scatter/assets`。
- 最近项目保存在 Electron `userData`，不是每个项目里。
- 应用启动先显示独立无边框启动窗口；主窗口隐藏加载，ready 后也要等启动窗口至少显示 5 秒再打开。
- 启动窗口和主窗口都保留透明 Electron 窗口、macOS 背景模糊和带透明度的应用/画布背景色。
- 主窗口未打开项目时仍显示主应用壳和左侧项目列表；没有最近项目时列表为空，不显示居中欢迎卡片或空状态文案。
- 左侧栏“设置”打开居中弹窗，包含主题、语言、半透明背景、恢复默认和保存设置；设置项切换后实时预览，未保存关闭时回退到打开弹窗前的设置；设置状态只保存在 renderer 内存中，不写入项目文件。
- 左侧栏可以通过顶部栏按钮收起；收起状态只保存在 renderer 内存中，不写入项目文件。收起后工作区铺满窗口宽度并保留左右 12px 边距，顶部栏左侧保留侧栏按钮和添加项目按钮，展开/收起需要有短过渡动画。
- 顶部栏右侧的任务清单和 Markdown 预览按钮打开工作区右侧侧边栏，不使用浮层。右侧侧边栏展开和收起需要有短过渡动画。任务清单侧栏固定 288px 并复用 `TaskItem`；清单只展示没有入边且有出边的 `flow` 流程起始节点任务，以及没有任何连线的 `node` 落单节点任务。被连接的子节点不要单独显示；落单节点有正文时显示可发送给 Codex，没有正文时显示暂未编辑。Markdown 预览侧栏和画布并排占用剩余空间，只提供源码/渲染预览、下载和复制，不放发送按钮；对应顶部栏按钮要显示选中态。
- Markdown 预览侧栏和画布之间需要有可拖拽分隔条；悬停和拖拽时使用横向 resize 光标，比例状态只保存在 renderer 内存中。
- 节点和连线变化后会短防抖自动保存。
- 附件先复制到项目目录，再挂到节点上。
- 双击附件项会在 Finder 中显示文件。
- 节点保存推理强度 `data.effort`，旧文档缺失时 hydrate 为 `xhigh`。
- 画布缩放使用 `Cmd` + 滚轮或缩放比例下拉菜单，画布平移使用手形工具或空格键临时进入，框选使用 `Shift` + 拖拽。
- 画布撤销/重做历史不写入项目文件；打开或切换项目时清空。
- 撤销附件操作只移除节点引用，不删除 `.scatter/assets` 中的文件。
- 运行 Codex 时，计划模式和推理强度只读取本次运行起始节点的配置。`flow` 模式的下游节点只提供上下文，下游节点自己的计划模式和推理强度不影响本次运行。
- 起始节点开启计划模式时，必须使用 Codex UI fallback 触发真实 `Shift+Tab` 计划模式，不要用 prompt 前缀模拟计划模式。该路径下附件通过 Markdown 中的 `.scatter/assets` 路径提供给 Codex 访问。
- `flow` 模式包含下游节点；`node` 模式只包含当前节点。
- Markdown 导出会复制当前生成结果到剪贴板。

## 已知风险和空缺

- 文档 schema 里有 viewport，但 React Flow 视口还没实际持久化。
- 还没有附件移除和 asset 清理。
- 暂无针对项目持久化、Markdown 遍历或撤销/重做历史的自动化测试。
- Codex UI fallback 依赖 macOS Accessibility 权限。
- 当前是桌面应用最小尺寸设计，不是响应式移动网页。

## 文档维护规则

当产品行为或架构变化时：

- 更新 `design.md`：产品、架构、数据和流程变化。
- 更新 `agents.md`：命令、约定、目录导航和协作规则变化。
- 两份文档都优先记录已经存在或明确决定的内容，避免写太多猜测。
