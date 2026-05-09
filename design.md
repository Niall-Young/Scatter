# Scatter 设计文档

更新时间：2026-05-09

这份文档记录当前项目的产品形态、技术结构和已知边界，先作为后续迭代的基线。以后功能变化时直接在这里继续改。

## 产品定位

Scatter 是一个本地优先的多模态任务画布，用来把零散任务节点、文件、图片和节点关系整理成结构化上下文，再发送给选定的本地 AI 运行器执行。当前运行器支持 Codex 和 Claude CLI。

当前核心目标：

- 以本地文件夹作为项目，不把项目数据放到云端。
- 用可编辑画布节点承载任务提示词、附件和执行意图。
- 用有向连线表达任务之间的上下游关系。
- 根据当前节点生成稳定、可预览、可复制的 Markdown。
- 支持“只运行当前节点”和“运行当前节点及子节点”两种范围。
- 支持计划模式，让选定运行器先出计划再等待确认。

## 当前用户流程

应用启动时会先显示一个独立无边框启动窗口，展示 Scatter 品牌、启动状态和工具箱视觉图。主窗口隐藏加载；主窗口 ready 且启动窗口至少显示 5 秒后，关闭启动窗口并显示主窗口。首次打开客户端且没有历史 `settings.json` 时，主窗口会先弹出居中的“偏好选择”弹窗，让用户在 Codex 和 Claude 之间选择偏好的 AI 工具；确认后会写入应用设置里的默认运行器，并标记首启偏好已完成。关闭该弹窗会保留默认 Codex，并同样标记完成，之后可在设置里调整。已有旧设置文件但缺少该标记时视为已完成，不会因升级打断用户。主窗口直接进入项目列表界面：左侧显示添加项目、搜索、成就、设置和最近项目列表；右侧工作区在未打开项目时居中显示文件夹图标和“选择或新建你的项目”（英文为“Select or create your project”）；如果没有最近项目，列表区域保持为空。用户可以选择或创建一个本地文件夹作为 Scatter 项目，也可以从最近项目列表重新打开；`⌘⇧N` 打开添加项目流程。从无项目状态首次打开或创建项目时，画布会从左到右展开出现；已经打开项目后再切换项目不触发这个进入动画。

启动窗口和主窗口使用透明 Electron 窗口配合 macOS 背景模糊。应用外层、启动页面板和画布区域都使用带透明度的背景色，不要改回完全不透明的窗口底色。

最近项目列表项在悬停或聚焦时显示“移除项目”图标按钮。这个操作只会从 Electron `userData` 的最近项目列表中移除记录，不删除用户本地项目文件夹，也不修改项目目录里的 `.scatter/scatter.json` 节点内容。

点击左侧栏“搜索”或按 `⌘F` 会打开居中的搜索项目弹窗。弹窗只搜索左侧最近项目列表中的项目，支持按项目名称或路径过滤；点击结果会关闭弹窗并打开对应项目。搜索弹窗使用和设置弹窗一致的 Radix Dialog 居中层，输入框打开后自动聚焦。

点击左侧栏“成就”会在工作区打开成就墙，侧边栏中的成就入口显示选中态，右侧任务清单和 Markdown 预览按钮在该视图中禁用。成就墙不依赖当前项目，包含标题、搜索框和 4 列成就卡片；成就图像是应用内静态资源，不写入用户项目目录。每个成就资源保留无背景、带背景和 fade 未完成三态；已达成展示无背景版本和达成日期，点击后打开居中弹窗，弹窗展示带背景版本、成就名称、达成条件、达成日期和“继续加油”按钮；未达成展示 fade 版本和达成条件。选择或创建项目会切回画布视图。

当某个成就从未达成变为已达成时，主窗口顶部中央会弹出成就专用 toast。toast 使用该成就的 default 带背景图，主文案为“{成就名}已达成！”，副文案为对应达成条件；右侧提供“查看”按钮打开成就墙，以及关闭按钮。已存在的成就初始加载时不会补弹，只有本次操作新解锁的成就会进入 toast 队列。

打开项目后，主界面包含四块：

- 左侧栏：添加项目、搜索项目、成就墙入口、最近项目列表、设置入口。
- 顶部栏：项目名、任务数量、保存状态、新建节点、任务清单、Markdown 预览、导出。
- 画布：基于 React Flow 的任务节点画布，支持拖拽节点、连线、缩放、定位画布以及撤销/重做。
- 右侧侧边栏：任务清单或 Markdown 预览。

点击左侧栏“设置”或按 `⌘,` 会打开居中的设置弹窗。弹窗包含主题、语言、默认运行器和半透明背景设置，底部提供恢复默认和保存设置。设置项切换后会实时预览；如果关闭弹窗而没有点击保存设置，会回退到打开弹窗前的设置。设置保存到 Electron `userData/settings.json`，不写入项目文件；主题支持跟随系统、浅色和深色，语言支持中文和英文，默认运行器支持 Codex 和 Claude CLI，半透明背景默认开启。语言切换覆盖应用 UI、状态提示、无障碍标签和 Scatter 生成的 Markdown 模板；用户输入的项目名、节点标题、节点正文、附件名和路径不会被自动翻译。

顶部栏左侧的侧栏按钮或 `⌘B` 可以收起或展开左侧栏。左侧栏收起后，项目列表区域隐藏，工作区铺满窗口宽度并保留左右 12px 边距；顶部栏左侧显示侧栏按钮和添加项目按钮。侧栏展开和收起带短过渡动画，这个折叠状态只保存在 renderer 内存中，不写入项目文件。

顶部栏右侧的任务清单和 Markdown 预览按钮会在工作区右侧打开侧边栏，不是悬浮弹出层；快捷键分别是 `⌘⇧T` 和 `⌘⇧M`。右侧侧边栏展开和收起带短过渡动画。顶部栏运行按钮和 Markdown 预览按钮都依赖当前选中节点；没有选中节点时禁用。顶部栏运行始终发送选中节点及其下游子节点，Markdown 预览也只展示选中节点及其下游子节点，不在未选中时生成全画布 Markdown。任务清单侧栏宽度为 288px，复用任务列表项组件；清单包含没有入边且有出边的流程起始节点任务，以及没有任何连线的落单节点任务。落单节点有正文时显示可发送给运行器，没有正文时显示暂未编辑；已经接入流程的子节点不单独出现在任务清单里。Markdown 预览侧栏与画布并排分配剩余空间，只提供源码/渲染预览、下载和复制，不放发送按钮。打开任一右侧侧栏时，画布在同一行内收缩，顶部栏对应按钮显示选中态。Markdown 预览侧栏和画布之间的分隔区域悬停时显示横向调整光标，并支持拖拽调整两侧比例。

画布交互约定：普通滚轮不缩放画布；触控板双指滑动会平移画布，触控板捏合会缩放画布；按住 `⌘` 加滚轮也可以缩放，右下角缩放比例下拉菜单提供 50%、75%、100%、150%、200%。`⌘N` 在当前项目中创建节点，`⌘0` 定位画布；`V` 切到选择工具，`H` 切到手形工具。手形工具进入画布平移模式，按住空格键会临时进入同一平移状态；按住 `⇧` 拖拽临时框选节点。节点右侧加号拖出连接线并松开到空白画布时，会创建下游节点并连接为当前节点 -> 新节点，新节点左侧连接点贴近松手点；没有上游节点时，节点左侧加号拖出连接线并松开到空白画布会创建上游节点并连接为新节点 -> 当前节点，新节点右侧连接点贴近松手点。按住 `⌥` 拖拽任意单个节点，会在松手位置复制该节点，原节点保留在原位。框选完成后只保留节点选中态，不显示持续存在的群组选框。

任务节点当前包含：

- 可编辑标题。
- 可编辑任务正文；正文区域保留最小高度，内容超过最小高度时节点自动增高，节点内部不出现滚动条。
- 附件列表，图片显示缩略图，文件显示文件项。
- 计划模式开关。
- 推理强度选择。
- 运行模式选择：运行该节点及子节点，或仅运行该节点。
- 发送到当前运行器的运行按钮。

附件入口：

- 节点内选择文件上传。
- 文件拖拽到应用。
- 粘贴剪贴板图片。
- 粘贴剪贴板文件。
- 粘贴纯文本到当前节点或自动创建的新节点。

## 技术架构

Scatter 是一个 Electron 桌面应用，使用 Electron Vite、React、TypeScript、Zustand 和 React Flow。

运行层次：

- Main process：负责窗口、IPC、项目持久化、文件系统访问、剪贴板附件处理和 AI 运行器集成。
- Preload：通过 `contextBridge` 暴露受控的 `window.scatter` API。
- Renderer：负责画布 UI、节点编辑、本地交互状态、Markdown 预览和用户操作。
- Shared types：定义 main、preload、renderer 共用的数据结构。

关键文件：

- `src/main/index.ts`：Electron 窗口创建和 IPC handler 注册。
- `resources/app-icon.png`、`resources/app-icon.icns`、`resources/app-icon.iconset`：macOS 应用图标源和导出尺寸。
- `src/main/projectStore.ts`：项目初始化、`.scatter` 存储、附件保存、最近项目列表。
- `src/main/assistantBridge.ts`：根据设置分发到 Codex 或 Claude CLI。
- `src/main/codexBridge.ts`：Codex Desktop 启动、app-server proxy 调用、URL fallback、AppleScript 粘贴 fallback。
- `src/main/claudeBridge.ts`：Claude CLI 定位、Terminal 启动和初始 prompt 脚本提交。
- `src/main/settingsStore.ts`：应用级设置的 `userData/settings.json` 读写和默认值 hydrate。
- `src/main/i18n.ts`：main process 用户可见文案的中英文模板。
- `src/preload/index.ts`：Renderer 可调用的安全 API。
- `src/shared/types.ts`：跨进程数据契约。
- `src/renderer/src/App.tsx`：Renderer 主应用编排。
- `src/renderer/src/store/scatterStore.ts`：Zustand 状态和状态修改方法。
- `src/renderer/src/lib/markdown.ts`：把节点和连线转换成运行器可读的 Markdown。
- `src/renderer/src/lib/translations.ts`：Renderer UI 的中英文词典和轻量插值函数。
- `src/renderer/src/lib/i18n.tsx`：Renderer i18n context。
- `src/renderer/src/components/TaskNode.tsx`：画布任务节点。
- `src/renderer/src/components/Sidebar.tsx`：项目导航侧栏。
- `src/renderer/src/components/AchievementsWall.tsx`：成就墙视图。
- `src/renderer/src/components/AchievementToast.tsx`：成就达成 toast。
- `src/renderer/src/lib/achievements.ts`：成就静态资源、名称、条件和展示顺序。
- `src/renderer/src/components/AssistantProviderPreferenceDialog.tsx`：首次打开客户端时选择默认 AI 工具的偏好弹窗。
- `src/renderer/src/components/SearchDialog.tsx`：居中项目搜索弹窗。
- `src/renderer/src/components/SettingsDialog.tsx`：居中设置弹窗。
- `src/renderer/src/components/Topbar.tsx`：工作区顶部操作栏。
- `src/renderer/src/components/RightDrawer.tsx`：任务清单和 Markdown 预览右侧侧边栏。
- `src/renderer/src/assets/achievements`：成就墙静态图片资源。
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

最近项目列表保存在 Electron `userData/recent-projects.json` 中，最多保留 24 个。应用设置保存在 Electron `userData/settings.json` 中，包含 `themePreference`、`language`、`assistantProvider`、`translucentBackground` 和 `assistantProviderOnboardingCompleted`；缺失或损坏时回退到中文、跟随系统主题、Codex 运行器、开启半透明背景和未完成首启偏好。旧设置中的 `claude-code` 会迁移为 `claude-cli`，旧 `claude` 客户端运行器会回退为默认 Codex；已有设置文件缺少 `assistantProviderOnboardingCompleted` 时会 hydrate 为已完成。成就状态保存在 Electron `userData/achievements.json` 中，不写入项目目录。

成就墙名称和达成条件随应用语言切换，英文名称使用成就资源文件名前缀的正式名称。成就按当前 UI 顺序展示；项目数量成就按成功进入画布的唯一项目路径计数，连续使用成就按本机本地日期记录，首次移出项目和首次成功联动 Codex 会在对应操作成功后解锁。成就一旦达成永久保留；Claude CLI 运行不会解锁 Codex 命名的成就。

## 持久化逻辑

打开或创建项目时，`projectStore.ts` 会确保 `.scatter/scatter.json` 和 `.scatter/assets` 存在。Renderer hydrate 项目后的首轮无变化状态不会立刻触发自动保存，避免打开项目时对同一目录做一次多余写入。

Renderer 中节点或连线变化后会触发 550ms 防抖保存，通过 IPC 调用 main process 写入 `scatter.json`。

附件会复制到 `.scatter/assets` 后再挂到节点上。节点上的添加附件按钮通过 main process 打开系统文件选择器，并在同一个 IPC 中复制文件，减少 macOS 把同一次上传识别成多次跨进程文件访问；Mac App Store security scoped bookmark 只用于本次复制过程。剪贴板图片会转为 PNG；剪贴板文件会尽量从 macOS 文件 URL 相关格式中读取。

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

`buildMarkdown` 负责把当前执行范围转成运行器可读的 Markdown，并根据当前应用语言生成中文或英文模板。

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

通过 Codex desktop proxy 路径发送时，图片附件的绝对路径也会作为 local image input 一起传给 Codex。通过 Codex UI fallback 或 Claude CLI 路径发送时，附件通过 Markdown 中的相对路径和绝对路径提供给运行器访问。

## 运行器集成

运行节点时，Renderer 调用 `window.scatter.runAssistant`，main process 根据应用级 `assistantProvider` 分发到 Codex 或 Claude CLI。计划模式和推理强度只读取本次运行起始节点配置。

### Codex Desktop

Scatter 会先为当前项目路径启动 Codex，然后尝试两条路径。

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

### Claude CLI

Claude CLI 路径使用本机 `claude` CLI 和 Terminal.app：

- 如果 Terminal 中已经有进程列表包含 `claude` 的 tab，或存在 Scatter 标记过、标题/内容可识别为 Claude Code 且仍由 Claude 相关进程承载的 tab，Scatter 会优先激活该 tab，并把本次 Markdown 作为下一条消息发送，避免重复打开 Claude CLI 会话。
- Scatter 新建 Claude CLI 会话时会给 Terminal tab 设置自定义标题 `Scatter Claude CLI`，并在启动过程中复用同一个 in-flight promise；新会话通过 `do script` 创建后再激活 Terminal，避免 Terminal 先生成空 shell 窗口。
- 优先使用 `CLAUDE_CODE_PATH`，否则查找常见安装路径，最后通过登录 shell 执行 `command -v claude`。
- 在 Terminal 中 `cd` 到当前项目路径后启动 `claude`；如果当前 Claude CLI 支持 `--name`，会设置会话名为 Scatter 生成的任务名。
- `data.effort` 会传给 `--effort`，其中 Scatter 的 `xhigh` 映射为 Claude CLI 的 `max`。
- 起始节点开启计划模式时使用 `--permission-mode plan`，否则使用 `--permission-mode default`。
- 把 Markdown 写入临时 prompt 文件，再通过临时 shell 脚本作为初始 prompt 传给 Terminal 中的 Claude CLI 会话。
- 附件通过 Markdown 中的相对路径和绝对路径提供；不会作为独立图片 input 发送。

Claude 桌面客户端当前不作为运行器选项。Claude Desktop 没有暴露类似 Codex `app-server proxy` 的本地集成接口，`claude://code/new?folder=...` 只能打开 Code tab，无法稳定提交完整 Markdown；依赖 UI 自动化会被“Trust this folder / 信任此文件夹”等客户端弹窗打断。因此 Scatter 只保留官方 CLI 路径作为 Claude 集成。

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
npm run pack
npm run dist:mac
```

`npm run build` 会先运行 TypeScript 检查，再执行 Electron Vite build。

`npm run dist:mac` 会先构建应用，再通过 Electron Builder 生成 macOS universal `.dmg` 和 `.zip` 安装产物，输出目录为 `release/`。当前本地打包配置不做代码签名和 notarization，适合内部试用分发；正式公开分发前需要接入 Apple Developer ID 签名和公证。

## 已知后续项

- 保存和恢复 React Flow viewport。
- 明确节点和连线删除交互。
- 增加附件移除和 asset 垃圾清理。
- 环形 flow 的 UI 提示可以更明显。
- 决定 `design.md` 后续偏产品规格、架构规格，还是两者合并。
- 为 Markdown 遍历和 project persistence 增加自动化测试。
