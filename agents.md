# Scatter Agent 说明

更新时间：2026-05-09

这份文件给后续参与 Scatter 的 AI agent 使用，记录项目概况、命令、目录、约定和容易踩坑的位置。修改架构、命令或协作规则时要同步更新。

## 项目概况

Scatter 是一个本地 Electron 桌面应用，用任务画布把节点、附件和连线关系转换成结构化提示词。项目数据保存在用户选择的本地文件夹 `.scatter` 目录中，附件会复制到 `.scatter/assets`，运行时把生成的 Markdown 发送给当前设置里的 AI 运行器。当前运行器支持 Codex 和 Claude CLI。

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
npm run pack
npm run dist:mac
```

代码改动至少运行 `npm run typecheck`。涉及 UI 或交互时，运行 `npm run dev` 并手动验证相关流程。需要生成 macOS 可安装包时运行 `npm run dist:mac`，产物输出到 `release/`。

## 目录地图

- `package.json`：脚本和依赖。
- `release/`：Electron Builder 输出目录，包含本地打包出的 `.dmg`、`.zip` 和 unpacked app。
- `electron.vite.config.ts`：main、preload、renderer 构建入口。
- `tsconfig.json`：严格 TypeScript 配置。
- `resources/app-icon.png`、`resources/app-icon.icns`、`resources/app-icon.iconset`：macOS 应用图标资源。
- `src/shared/types.ts`：main、preload、renderer 共享的数据契约。
- `src/main/index.ts`：Electron 启动和 IPC 注册。
- `src/main/projectStore.ts`：项目文档、最近项目、附件持久化。
- `src/main/assistantBridge.ts`：AI 运行器分发。
- `src/main/codexBridge.ts`：Codex Desktop 集成。
- `src/main/claudeBridge.ts`：Claude CLI / Terminal 集成。
- `src/main/settingsStore.ts`：应用级设置持久化。
- `src/main/i18n.ts`：main process 用户可见文案。
- `src/preload/index.ts`：类型化的 `window.scatter` API。
- `src/renderer/src/App.tsx`：renderer 顶层逻辑。
- `src/renderer/src/store/scatterStore.ts`：Zustand 状态和 mutator。
- `src/renderer/src/lib/markdown.ts`：执行范围遍历和 Markdown 生成。
- `src/renderer/src/lib/achievements.ts`：成就静态资源、名称、条件和展示顺序。
- `src/renderer/src/lib/translations.ts`：renderer 中英文词典。
- `src/renderer/src/lib/i18n.tsx`：renderer i18n context。
- `src/renderer/src/components`：业务组件。
- `src/renderer/src/components/AchievementsWall.tsx`：成就墙视图。
- `src/renderer/src/components/AchievementToast.tsx`：成就达成 toast。
- `src/renderer/src/components/AssistantProviderPreferenceDialog.tsx`：首次打开客户端时选择默认 AI 工具的偏好弹窗。
- `src/renderer/src/components/SearchDialog.tsx`：居中项目搜索弹窗。
- `src/renderer/src/components/SettingsDialog.tsx`：居中设置弹窗。
- `src/renderer/src/assets/achievements`：成就墙静态图片资源。
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
- UI 文案默认中文优先；新增或修改 Scatter 生成的 UI、空状态、状态、aria、title 或 Markdown 模板文案时，必须同步维护 `src/renderer/src/lib/translations.ts` 的中英文词条，不能在组件里写死单一语言。
- 图标优先使用现有 `Icon` 名称；需要新增时放到 `src/renderer/src/assets/icons`。
- 图标按钮必须复用 `src/renderer/src/components/ui/icon-button.tsx` 的 `IconButton`，不要在业务组件里手写 icon-only `<button>`；需要悬停说明或快捷键时复用 `src/renderer/src/components/ui/tooltip.tsx` 的 `TooltipAnchor`/`Tooltip`。

## 常见改动路径

数据模型变化：

- 更新 `src/shared/types.ts`。
- 更新 `src/main/projectStore.ts` 的默认值和 hydrate 逻辑。
- 更新 `src/renderer/src/store/scatterStore.ts`。
- 更新 `src/renderer/src/App.tsx` 中的保存和加载使用方式。
- 如果影响运行器上下文，更新 `src/renderer/src/lib/markdown.ts`。
- 同步更新 `design.md` 和 `agents.md`。

新增 IPC 能力：

- 在 `src/main/index.ts` 注册 handler。
- 在 main process 模块中实现需要权限的逻辑。
- 在 `src/preload/index.ts` 暴露类型化方法。
- 必要时更新 renderer 全局类型声明。
- Renderer 只能通过 `window.scatter` 调用。

应用设置变化：

- 更新 `src/shared/types.ts` 的 `AppSettings`、`AssistantProvider`、`LanguagePreference` 或 `ThemePreference`。
- 更新 `src/main/settingsStore.ts` 的默认值和 hydrate 逻辑。
- 更新 `src/main/index.ts` 和 `src/preload/index.ts` 的设置 IPC。
- 更新 `src/renderer/src/lib/translations.ts`、`src/renderer/src/lib/i18n.tsx` 和相关组件。
- 同步更新 `design.md` 和 `agents.md`。

Markdown 或执行范围变化：

- 从 `src/renderer/src/lib/markdown.ts` 开始。
- 同时验证 `flow` 和 `node` 两种模式。
- 检查环形 flow 的行为。
- 确保附件路径对当前运行器仍然明确可用。
- Markdown 模板文案属于语言切换范围；修改模板标题、说明、警告或状态时要同时覆盖中英文。

画布撤销/重做变化：

- 从 `src/renderer/src/store/scatterStore.ts` 开始，历史栈只保存在 renderer 内存中。
- 文档编辑使用 `commitCanvasChange`；选中态、hover 等 UI 状态使用 `replaceCanvasLive` 或普通 UI setter。
- 拖拽、文本编辑、粘贴/拖拽自动创建节点这类组合操作用 `beginHistoryTransaction` 和 `commitHistoryTransaction` 合并为一步。
- 不要把 `selected`、抽屉、主题、视口、保存状态或 `data.lastRunAt` 做成撤销历史。
- 左下角撤销/重做按钮必须由 `canUndo`、`canRedo` 控制禁用态；快捷键保持 `⌘Z` 和 `⌘⇧Z`。新增或调整全局快捷键时同步更新 `src/renderer/src/lib/shortcuts.ts`、相关 tooltip 和 `design.md`。快捷键展示必须使用 macOS 符号：`⌘`、`⇧`、`⌥`、`⌃`，不要写成英文按键名称。

AI 运行器启动行为变化：

- 从 `src/main/assistantBridge.ts`、`src/main/codexBridge.ts` 和 `src/main/claudeBridge.ts` 开始。
- 除非明确替换，否则保留 Codex desktop proxy 和 UI fallback 两条路径。
- Claude CLI 优先复用 Terminal.app 里已经运行 `claude` 的 tab，或 Scatter 标记为 `Scatter Claude CLI`、标题/内容可识别为 Claude Code 且仍由 Claude 相关进程承载的 tab；没有现有 tab 时通过 `claude` CLI 启动新会话，启动过程需要用 in-flight promise 去重，新会话必须先 `do script` 再激活 Terminal，避免额外空 shell 窗口；`xhigh` 映射到 `--effort max`，计划模式映射到 `--permission-mode plan`。
- 不提供 Claude 桌面客户端运行器。Claude Desktop 没有类似 Codex `app-server proxy` 的本地接口，`claude://code/new?folder=...` 只能打开 Code tab，不能稳定提交完整 Markdown，且 UI 自动化会被“Trust this folder / 信任此文件夹”等弹窗打断。
- 注意 Codex UI fallback 依赖 macOS 辅助功能权限；Claude CLI 路径通过 Terminal.app 打开临时脚本提交初始 prompt。
- 保持 `cwd` 指向当前项目文件夹。

视觉改动：

- 优先从 `src/renderer/src/styles/app.css` 调整。
- 复用 `Button`、`Switch`、`Icon`。
- 保持界面紧凑、工具型。
- 左侧栏“搜索”按钮打开居中搜索项目弹窗，只搜索左侧最近项目列表；不要恢复成系统文件夹选择器。
- 左侧栏“成就”按钮打开工作区内成就墙，成就墙不依赖当前项目，不写入项目文件；已达成成就展示无背景资源和达成日期，点击后打开居中弹窗展示带背景资源、名称、达成条件、达成日期和“继续加油”按钮；未达成成就展示 fade 资源和达成条件；选择或创建项目时切回画布。成就刚达成时弹出专用 toast，图片使用 default 带背景资源，主文案是“{成就名}已达成！”，副文案是达成条件，“查看”按钮打开成就墙。
- 左侧栏“设置”按钮打开居中设置弹窗，不要恢复成直接切换主题。
- 首次打开客户端且尚未生成 `settings.json` 时，主窗口显示“偏好选择”弹窗，让用户选择 Codex 或 Claude；选择结果写入应用设置里的默认运行器。关闭弹窗会保留当前默认 Codex 并标记首启偏好已完成。已有旧设置文件缺少首启标记时视为已完成，不要打断升级用户。
- 验证启动页、无项目空状态、画布、任务节点、右侧侧边栏和深色模式。
- 顶部栏左侧的侧栏按钮使用 `IconButton`；展开态显示侧栏收起按钮，收起态显示侧栏展开按钮和添加项目按钮。侧栏切换快捷键是 `⌘B`，任务清单是 `⌘⇧T`，Markdown 预览是 `⌘⇧M`，运行当前任务是 `⌘↩`。

画布交互变化：

- 从 `src/renderer/src/App.tsx` 的 React Flow props 开始。
- 普通滚轮不要缩放画布；触控板双指滑动平移画布，触控板捏合缩放画布，`⌘` 加滚轮也可以缩放画布。
- 手形工具进入画布平移模式；按住空格键临时进入同一平移状态。
- 缩放比例按钮必须打开下拉菜单，提供 50%、75%、100%、150%、200%。
- 节点右侧加号拖线松开到空白画布时创建下游节点并连接为当前节点 -> 新节点；没有上游节点时，左侧加号拖线松开到空白画布创建上游节点并连接为新节点 -> 当前节点。新节点的对应连接点要贴近松手点，必要时只做小范围挪动，不能因为通用避让逻辑跳到远处；该组合操作必须作为一步进入撤销/重做历史。不要改变左侧加号已有上游时隐藏的原有规则。
- 按住 `⌥` 拖拽任意单个节点会在松手位置复制该节点，原节点保留在原位；该复制操作必须作为一步进入撤销/重做历史，拖拽过程中的临时位置不能写入项目文件。
- `⇧` 框选只在框选过程中显示选框；结束后只保留节点选中态，不显示持续存在的群组选框。

## 需要保留的当前行为

- 打开或创建文件夹时初始化 `.scatter/scatter.json` 和 `.scatter/assets`。
- 最近项目保存在 Electron `userData`，不是每个项目里。
- 应用启动先显示独立无边框启动窗口；主窗口隐藏加载，ready 后也要等启动窗口至少显示 5 秒再打开。
- 启动窗口和主窗口都保留透明 Electron 窗口、macOS 背景模糊和带透明度的应用/画布背景色。
- 主窗口未打开项目时仍显示主应用壳和左侧项目列表；工作区中间显示文件夹图标和随语言切换的“选择或新建你的项目”/“Select or create your project”；没有最近项目时左侧列表为空。从无项目状态打开或创建项目时，画布需要从左到右展开出现；已打开项目之间切换时不要触发这个进入动画。
- 最近项目列表项悬停或聚焦时显示“移除项目”图标按钮，只移除最近项目记录，不删除用户项目文件夹，也不能修改项目目录里的 `.scatter/scatter.json` 节点内容。
- 左侧栏“添加项目”或 `⌘⇧N` 打开添加项目流程。
- 左侧栏“搜索”或 `⌘F` 打开居中项目搜索弹窗，输入框默认聚焦，按项目名称或路径过滤最近项目；点击结果关闭弹窗并打开对应项目。
- 左侧栏“成就”打开成就墙视图，侧边栏中成就入口显示选中态；成就墙展示标题、搜索框和成就卡片，右侧任务清单和 Markdown 预览按钮在该视图中禁用。每个成就资源保留无背景、带背景和 fade 三态；英文名以资源文件名前缀为准。已达成成就可点击打开居中详情弹窗，未达成成就不可点击。成就状态保存在 Electron `userData/achievements.json`，项目数量成就按成功进入画布的唯一项目路径计数，连续使用成就按本机本地日期记录，首次移出项目和首次成功联动 Codex 在对应操作成功后解锁；成就一旦达成不回退。本次操作新解锁的成就会弹出 toast，初始加载已有成就不补弹。
- 左侧栏“设置”或 `⌘,` 打开居中弹窗，包含主题、语言、默认运行器、半透明背景、恢复默认和保存设置；设置项切换后实时预览，未保存关闭时回退到打开弹窗前的设置；保存后的设置写入 Electron `userData/settings.json`，不写入项目文件。
- 第一次打开客户端且没有历史设置文件时，会弹出居中的“偏好选择”弹窗；点击 Codex 或 Claude 后点“选好了”会同步写入设置的默认运行器，并把首启偏好标记为已完成。关闭弹窗不改变默认 Codex，但同样不再重复弹出。
- 左侧栏可以通过顶部栏按钮收起；收起状态只保存在 renderer 内存中，不写入项目文件。收起后工作区铺满窗口宽度并保留左右 12px 边距，顶部栏左侧保留侧栏按钮和添加项目按钮，展开/收起需要有短过渡动画。
- 顶部栏右侧的任务清单和 Markdown 预览按钮打开工作区右侧侧边栏，不使用浮层。右侧侧边栏展开和收起需要有短过渡动画。顶部栏运行按钮和 Markdown 预览按钮必须依赖当前选中节点；没有选中节点时禁用。顶部栏运行始终发送选中节点及其下游子节点，Markdown 预览也只展示选中节点及其下游子节点，不在未选中时生成全画布 Markdown。任务清单侧栏固定 288px 并复用 `TaskItem`；清单只展示没有入边且有出边的 `flow` 流程起始节点任务，以及没有任何连线的 `node` 落单节点任务。被连接的子节点不要单独显示；落单节点有正文时显示可发送给运行器，没有正文时显示暂未编辑。Markdown 预览侧栏和画布并排占用剩余空间，只提供源码/渲染预览、下载和复制，不放发送按钮；对应顶部栏按钮要显示选中态。
- Markdown 预览侧栏和画布之间需要有可拖拽分隔条；悬停和拖拽时使用横向 resize 光标，比例状态只保存在 renderer 内存中。
- 节点和连线变化后会短防抖自动保存；打开或切换项目后的首次 hydrate 不做无变化自动保存。
- 附件先复制到项目目录，再挂到节点上；节点上传按钮必须走 main process 的附件选择 IPC，让系统文件选择和复制发生在同一次主进程流程里，避免 macOS 重复请求同一文件权限。拖拽和粘贴附件继续走 renderer 收集输入后交给 main process 保存的路径。
- 双击附件项会在 Finder 中显示文件。
- 节点保存推理强度 `data.effort`，旧文档缺失时 hydrate 为 `xhigh`。
- 画布缩放使用触控板捏合、`⌘` + 滚轮或缩放比例下拉菜单；画布平移使用触控板双指滑动、手形工具或空格键临时进入；框选使用 `⇧` + 拖拽，复制节点可按住 `⌥` 拖拽任意节点。节点右侧加号、以及没有上游节点时的左侧加号，拖线松开到空白画布会自动创建并连接下游或上游节点，且新节点连接点贴近松手点。画布快捷键包括 `⌘N` 新建节点、`⌘0` 定位画布、`V` 选择工具、`H` 手形工具。
- 画布撤销/重做历史不写入项目文件；打开或切换项目时清空。
- 撤销附件操作只移除节点引用，不删除 `.scatter/assets` 中的文件。
- 运行当前运行器时，计划模式和推理强度只读取本次运行起始节点的配置。`flow` 模式的下游节点只提供上下文，下游节点自己的计划模式和推理强度不影响本次运行。
- 使用 Codex 运行且起始节点开启计划模式时，必须使用 Codex UI fallback 触发真实 `⇧Tab` 计划模式，不要用 prompt 前缀模拟计划模式。该路径下附件通过 Markdown 中的 `.scatter/assets` 路径提供给 Codex 访问。
- 使用 Claude CLI 运行时，必须优先复用 Terminal.app 里已有的 `claude` tab，或 Scatter 标记为 `Scatter Claude CLI`、标题/内容可识别为 Claude Code 且仍由 Claude 相关进程承载的 tab；没有现有 tab 才启动 `claude`，启动中要去重且不要在 `do script` 前激活 Terminal，避免多个 Terminal tab 或额外空 shell 窗口，计划模式使用 `--permission-mode plan`，Markdown 通过现有 tab 粘贴或新会话临时 prompt 文件传入，附件通过 Markdown 路径提供。
- `flow` 模式包含下游节点；`node` 模式只包含当前节点。
- Markdown 导出会复制当前生成结果到剪贴板。

## 已知风险和空缺

- 文档 schema 里有 viewport，但 React Flow 视口还没实际持久化。
- 还没有附件移除和 asset 清理。
- 暂无针对项目持久化、Markdown 遍历或撤销/重做历史的自动化测试。
- Codex UI fallback 依赖 macOS Accessibility 权限；Claude CLI 路径依赖 macOS 允许 Scatter 打开 Terminal。
- 当前是桌面应用最小尺寸设计，不是响应式移动网页。

## 文档维护规则

当产品行为或架构变化时：

- 更新 `design.md`：产品、架构、数据和流程变化。
- 更新 `agents.md`：命令、约定、目录导航和协作规则变化。
- 两份文档都优先记录已经存在或明确决定的内容，避免写太多猜测。
