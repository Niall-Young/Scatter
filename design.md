# Scatter 设计文档

更新时间：2026-05-03

这份文档记录当前项目的产品形态、技术结构和已知边界，先作为后续迭代的基线。以后功能变化时直接在这里继续改。

## 产品定位

Scatter 是一个本地优先的多模态任务画布，用来把零散任务节点、文件、图片和节点关系整理成结构化上下文，再发送给 Codex Desktop 执行。

当前核心目标：

- 以本地文件夹作为项目，不把项目数据放到云端。
- 用可编辑画布节点承载任务提示词、附件和执行意图。
- 用有向连线表达任务之间的上下游关系。
- 根据当前节点生成稳定、可预览、可复制的 Markdown。
- 支持“只运行当前节点”和“运行当前节点及子节点”两种范围。
- 支持计划模式，让 Codex 先出计划再等待确认。

## 当前用户流程

应用启动时会先显示一个独立无边框启动窗口，展示 Scatter 品牌、启动状态和工具箱视觉图。主窗口隐藏加载；主窗口 ready 且启动窗口至少显示 5 秒后，关闭启动窗口并显示主窗口。主窗口直接进入项目列表界面：左侧显示添加项目、搜索、设置和最近项目列表；右侧工作区在未打开项目时居中显示文件夹图标和“选择或新建你的项目”（英文为“Select or create your project”）；如果没有最近项目，列表区域保持为空。用户可以选择或创建一个本地文件夹作为 Scatter 项目，也可以从最近项目列表重新打开；`⌘⇧N` 打开添加项目流程。从无项目状态首次打开或创建项目时，画布会从左到右展开出现；已经打开项目后再切换项目不触发这个进入动画。

启动窗口和主窗口使用透明 Electron 窗口配合 macOS 背景模糊。应用外层、启动页面板和画布区域都使用带透明度的背景色，不要改回完全不透明的窗口底色。

最近项目列表项在悬停或聚焦时显示“移出项目”图标按钮。这个操作只会从 Electron `userData` 的最近项目列表中移除记录，不删除用户本地项目文件夹。

点击左侧栏“搜索”或按 `⌘F` 会打开居中的搜索项目弹窗。弹窗只搜索左侧最近项目列表中的项目，支持按项目名称或路径过滤；点击结果会关闭弹窗并打开对应项目。搜索弹窗使用和设置弹窗一致的 Radix Dialog 居中层，输入框打开后自动聚焦。

打开项目后，主界面包含四块：

- 左侧栏：添加项目、搜索项目、最近项目列表、设置入口。
- 顶部栏：项目名、任务数量、保存状态、新建节点、任务清单、Markdown 预览、导出。
- 画布：基于 React Flow 的任务节点画布，支持拖拽节点、连线、缩放、定位画布以及撤销/重做。
- 右侧侧边栏：任务清单或 Markdown 预览。

点击左侧栏“设置”或按 `⌘,` 会打开居中的设置弹窗。弹窗包含主题、语言和半透明背景三项设置，底部提供恢复默认和保存设置。设置项切换后会实时预览；如果关闭弹窗而没有点击保存设置，会回退到打开弹窗前的设置。设置保存到 Electron `userData/settings.json`，不写入项目文件；主题支持跟随系统、浅色和深色，语言支持中文和英文，半透明背景默认开启。语言切换覆盖应用 UI、状态提示、无障碍标签和 Scatter 生成的 Markdown 模板；用户输入的项目名、节点标题、节点正文、附件名和路径不会被自动翻译。

顶部栏左侧的侧栏按钮或 `⌘B` 可以收起或展开左侧栏。左侧栏收起后，项目列表区域隐藏，工作区铺满窗口宽度并保留左右 12px 边距；顶部栏左侧显示侧栏按钮和添加项目按钮。侧栏展开和收起带短过渡动画，这个折叠状态只保存在 renderer 内存中，不写入项目文件。

顶部栏右侧的任务清单和 Markdown 预览按钮会在工作区右侧打开侧边栏，不是悬浮弹出层；快捷键分别是 `⌘⇧T` 和 `⌘⇧M`。右侧侧边栏展开和收起带短过渡动画。任务清单侧栏宽度为 288px，复用任务列表项组件；清单包含没有入边且有出边的流程起始节点任务，以及没有任何连线的落单节点任务。落单节点有正文时显示可发送给 Codex，没有正文时显示暂未编辑；已经接入流程的子节点不单独出现在任务清单里。Markdown 预览侧栏与画布并排分配剩余空间，只提供源码/渲染预览、下载和复制，不放发送按钮。打开任一右侧侧栏时，画布在同一行内收缩，顶部栏对应按钮显示选中态。Markdown 预览侧栏和画布之间的分隔区域悬停时显示横向调整光标，并支持拖拽调整两侧比例。

画布交互约定：普通滚轮不缩放画布；按住 `⌘` 加滚轮缩放，右下角缩放比例下拉菜单提供 50%、75%、100%、150%、200%。`⌘N` 在当前项目中创建节点，`⌘0` 定位画布；`V` 切到选择工具，`H` 切到手形工具。手形工具进入画布平移模式，按住空格键会临时进入同一平移状态；按住 `⇧` 拖拽临时框选节点。框选完成后只保留节点选中态，不显示持续存在的群组选框。

任务节点当前包含：

- 可编辑标题。
- 可编辑任务正文。
- 附件列表，图片显示缩略图，文件显示文件项。
- 计划模式开关。
- 推理强度选择。
- 运行模式选择：运行该节点及子节点，或仅运行该节点。
- 发送到 Codex 的运行按钮。

附件入口：

- 节点内选择文件上传。
- 文件拖拽到应用。
- 粘贴剪贴板图片。
- 粘贴剪贴板文件。
- 粘贴纯文本到当前节点或自动创建的新节点。

## 技术架构

Scatter 是一个 Electron 桌面应用，使用 Electron Vite、React、TypeScript、Zustand 和 React Flow。

运行层次：

- Main process：负责窗口、IPC、项目持久化、文件系统访问、剪贴板附件处理和 Codex 集成。
- Preload：通过 `contextBridge` 暴露受控的 `window.scatter` API。
- Renderer：负责画布 UI、节点编辑、本地交互状态、Markdown 预览和用户操作。
- Shared types：定义 main、preload、renderer 共用的数据结构。

关键文件：

- `src/main/index.ts`：Electron 窗口创建和 IPC handler 注册。
- `resources/app-icon.png`、`resources/app-icon.icns`、`resources/app-icon.iconset`：macOS 应用图标源和导出尺寸。
- `src/main/projectStore.ts`：项目初始化、`.scatter` 存储、附件保存、最近项目列表。
- `src/main/codexBridge.ts`：Codex Desktop 启动、app-server proxy 调用、URL fallback、AppleScript 粘贴 fallback。
- `src/main/settingsStore.ts`：应用级设置的 `userData/settings.json` 读写和默认值 hydrate。
- `src/main/i18n.ts`：main process 用户可见文案的中英文模板。
- `src/preload/index.ts`：Renderer 可调用的安全 API。
- `src/shared/types.ts`：跨进程数据契约。
- `src/renderer/src/App.tsx`：Renderer 主应用编排。
- `src/renderer/src/store/scatterStore.ts`：Zustand 状态和状态修改方法。
- `src/renderer/src/lib/markdown.ts`：把节点和连线转换成 Codex Markdown。
- `src/renderer/src/lib/translations.ts`：Renderer UI 的中英文词典和轻量插值函数。
- `src/renderer/src/lib/i18n.tsx`：Renderer i18n context。
- `src/renderer/src/components/TaskNode.tsx`：画布任务节点。
- `src/renderer/src/components/Sidebar.tsx`：项目导航侧栏。
- `src/renderer/src/components/SearchDialog.tsx`：居中项目搜索弹窗。
- `src/renderer/src/components/SettingsDialog.tsx`：居中设置弹窗。
- `src/renderer/src/components/Topbar.tsx`：工作区顶部操作栏。
- `src/renderer/src/components/RightDrawer.tsx`：任务清单和 Markdown 预览右侧侧边栏。
- `src/renderer/src/styles/app.css`：设计 token、布局、节点样式、右侧侧边栏样式和主题变量。

## 数据模型

Scatter 项目就是用户选择的普通本地文件夹。Scatter 自己的数据放在项目目录的 `.scatter` 下：

```text
<project>/
  .scatter/
    scatter.json
    assets/
      <uuid>-<sanitized-name>.<ext>
```

`scatter.json` 保存 `ScatterDocument`：

- `version`：当前为 `1`。
- `projectName`：默认来自项目文件夹名。
- `updatedAt`：保存时更新的 ISO 时间。
- `viewport`：已在 schema 中声明，目前保存为 `{ x: 0, y: 0, zoom: 1 }`。
- `nodes`：任务节点。
- `edges`：有向连线。

每个节点保存：

- `id`、`type`、画布 `position`。
- 可选 `width`、`height`、`selected`。
- `data.title`：标题。
- `data.body`：提示词正文。
- `data.attachments`：附件。
- `data.effort`：推理强度，默认 `xhigh`。
- `data.planMode`：计划模式。
- `data.runMode`：运行范围。
- 可选 `data.lastRunAt`。

每个附件保存：

- 原始文件名、MIME、大小、来源、创建时间。
- 存储后的绝对路径。
- 相对 `.scatter/assets/...` 路径。
- Renderer 预览使用的 file URL。
- 类型：`image` 或 `file`。

最近项目列表保存在 Electron `userData/recent-projects.json` 中，最多保留 24 个。应用设置保存在 Electron `userData/settings.json` 中，包含 `themePreference`、`language` 和 `translucentBackground`；缺失或损坏时回退到中文、跟随系统主题和开启半透明背景。

## 持久化逻辑

打开或创建项目时，`projectStore.ts` 会确保 `.scatter/scatter.json` 和 `.scatter/assets` 存在。

Renderer 中节点或连线变化后会触发 550ms 防抖保存，通过 IPC 调用 main process 写入 `scatter.json`。

附件会复制到 `.scatter/assets` 后再挂到节点上。剪贴板图片会转为 PNG；剪贴板文件会尽量从 macOS 文件 URL 相关格式中读取。

当前限制：

- React Flow 视口还没有真正保存和恢复。
- 还没有附件删除和无用 asset 清理。
- `ScatterEdge` 有 `label` 字段，但 UI 里还不能编辑连线标签。

## 撤销和重做

Renderer 在 `scatterStore.ts` 中维护非持久化的内存历史栈，最多保留 100 步。打开或切换项目时会清空历史；历史不会写入 `scatter.json`。

历史覆盖画布文档编辑：节点新增、复制、删除、移动，连线新增/删除，附件引用新增/删除，节点标题、正文、推理强度、计划模式和运行范围。历史不覆盖选中态、hover、高亮、抽屉、主题、视口、保存状态和 `data.lastRunAt`。

左下角画布操作区的撤销/重做按钮由 `canUndo`、`canRedo` 控制禁用态。快捷键为 `⌘Z` 撤销、`⌘⇧Z` 重做；输入框或文本域聚焦时不拦截快捷键，让文本编辑中的系统级逐次撤销先工作。运行当前任务的快捷键是 `⌘↩`。标题和正文退出编辑时，会把本次编辑合并为画布历史中的一步。

附件撤销只移除节点里的附件引用，不删除 `.scatter/assets` 中已经复制的文件。

## Markdown 生成

`buildMarkdown` 负责把当前执行范围转成 Codex 可读的 Markdown，并根据当前应用语言生成中文或英文模板。

运行模式：

- `flow`：包含当前节点和所有下游子节点。
- `node`：只包含当前节点。

运行设置：

- 计划模式和推理强度都只读取本次运行的起始节点配置。
- 在 `flow` 模式下，下游节点自己的计划模式和推理强度不影响本次运行；下游节点只作为上下文进入 Markdown。

排序规则：

- 从当前节点开始遍历。
- 沿 source -> target 的出边向下游走。
- 同级子节点按画布 `y` 坐标排序，再按 `x` 坐标排序。
- 如果发现环，会在 Markdown 中加入警告。

生成的 Markdown 包含：

- Scatter task 标题。
- 项目名和项目路径。
- 运行模式和计划模式状态。
- 每个包含节点的标题、节点 ID、提示词、附件。
- 当前范围内的连接关系。
- 所有附件的相对路径和绝对路径。

Markdown 模板中的标题、运行模式、计划模式状态、附件说明、环形警告和执行请求会随语言切换；节点标题、提示词正文、附件文件名和路径保持用户原始内容。

通过 Codex desktop proxy 路径发送时，图片附件的绝对路径也会作为 local image input 一起传给 Codex。通过 UI fallback 路径发送时，附件通过 Markdown 中的相对路径和绝对路径提供给 Codex 访问。

## Codex 集成

运行节点时，Scatter 会先为当前项目路径启动 Codex，然后尝试两条路径。

第一条是 desktop proxy：

- 优先使用 `/Applications/Codex.app/Contents/Resources/codex`，否则使用 PATH 中的 `codex`。
- 通过默认 control socket 连接 `codex app-server proxy`。
- 初始化 Scatter client。
- 以项目文件夹作为 `cwd` 创建 Codex thread。
- 设置 thread 名称。
- 发送 Markdown 文本和本地图片路径。
- 打开 `codex://threads/<id>`。

第二条是 UI fallback：

- 打开 `codex://threads/new?path=<projectPath>`。
- 如果起始节点开启计划模式，先用 `⇧Tab` 切换 Codex 输入框的真实计划模式。
- 把 Markdown 写入剪贴板。
- 用 AppleScript 在 Codex 中粘贴并提交。

计划模式会作为运行参数从起始节点传入当前 Codex 运行链路。起始节点开启计划模式时，Scatter 跳过 desktop proxy 并使用 UI fallback，以触发 Codex 的真实 `⇧Tab` 计划模式；此时附件通过 Markdown 路径提供，不作为 proxy 的 local image input 发送。

desktop proxy 当前使用：

- `approvalPolicy`: `on-request`
- sandbox: `workspace-write`
- `cwd`: 当前项目路径

## 视觉设计

当前界面是偏工具型的本地桌面应用：

- 中性色画布和面板。
- 紧凑控件与任务节点。
- 通过 CSS 变量管理浅色和深色主题。
- 主操作使用蓝色。
- 字体使用系统字体栈，并包含中文字体 fallback。
- 应用最小尺寸为 1040 x 720。

整体方向是高密度、可重复使用、偏工作台，而不是营销页或展示页。任务节点是主要视觉对象，左侧栏和右侧侧边栏承担辅助信息。

## 开发命令

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

`npm run build` 会先运行 TypeScript 检查，再执行 Electron Vite build。

## 已知后续项

- 保存和恢复 React Flow viewport。
- 明确节点和连线删除交互。
- 增加附件移除和 asset 垃圾清理。
- 环形 flow 的 UI 提示可以更明显。
- 决定 `design.md` 后续偏产品规格、架构规格，还是两者合并。
- 为 Markdown 遍历和 project persistence 增加自动化测试。
