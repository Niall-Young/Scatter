# Scatter Design

Last updated: 2026-05-02

This document captures the current project shape as a baseline. It should be treated as a living design note and updated as the product changes.

## Product Intent

Scatter is a local-first multimodal task canvas for composing structured Codex work. A user selects a local project folder, creates task nodes on a canvas, attaches images or files, connects nodes into flows, previews the generated Markdown, and sends either one node or a downstream flow into Codex Desktop.

Core goals:

- Keep the user's project and attachments local.
- Make task context visible as editable canvas nodes.
- Preserve relationships between tasks through directed edges.
- Generate predictable Markdown that Codex can execute from the selected project folder.
- Support both direct execution and plan-first execution.

## Current User Experience

The app starts on a welcome screen when no project is open. The user can create or open a local folder and can reopen recent projects.

Once a project is open, the main workspace has four areas:

- Sidebar: project actions, recent local projects, and light/dark theme toggle.
- Topbar: active project name, task count, save status, add-node action, task drawer, Markdown preview, and export.
- Canvas: React Flow workspace with draggable task nodes, directed connections, minimap, controls, and dotted background.
- Right drawer: task list or generated Markdown preview.

Each task node contains:

- Editable title.
- Editable prompt body.
- Attachments with image previews or file chips.
- A plan-mode switch.
- A run-mode selector for current node only or current node plus downstream children.
- A run button that sends context to Codex.

Supported attachment entry points:

- File upload from a node.
- Drag and drop onto the app.
- Clipboard image paste.
- Clipboard file paste.
- Plain text paste into the selected or newly created node.

## Architecture

Scatter is an Electron app built with Electron Vite, React, TypeScript, Zustand, and React Flow.

Runtime layers:

- Main process: owns windows, project persistence, filesystem access, clipboard file/image handling, and Codex launch/proxy integration.
- Preload script: exposes a typed `window.scatter` IPC facade to the renderer.
- Renderer: owns canvas UI, local UI state, node editing, Markdown preview, and user interactions.
- Shared types: define the persisted document, nodes, edges, attachments, and Codex run input/output contracts.

Important files:

- `src/main/index.ts`: Electron window creation and IPC handlers.
- `src/main/projectStore.ts`: project folder initialization, `.scatter` persistence, attachment storage, recent project storage.
- `src/main/codexBridge.ts`: Codex Desktop startup, app-server proxy flow, URL fallback, and AppleScript paste fallback.
- `src/preload/index.ts`: safe renderer API bridge.
- `src/shared/types.ts`: cross-process data contracts.
- `src/renderer/src/App.tsx`: main React application orchestration.
- `src/renderer/src/store/scatterStore.ts`: Zustand state store.
- `src/renderer/src/lib/markdown.ts`: Scatter document to Codex Markdown conversion.
- `src/renderer/src/components/TaskNode.tsx`: editable canvas node.
- `src/renderer/src/components/Sidebar.tsx`: project navigation.
- `src/renderer/src/components/Topbar.tsx`: workspace actions.
- `src/renderer/src/components/RightDrawer.tsx`: task list and Markdown preview.
- `src/renderer/src/styles/app.css`: design tokens, layout, node styling, drawer styling, and theme variables.

## Data Model

Projects are ordinary local folders. Scatter stores project metadata inside the selected folder:

```text
<project>/
  .scatter/
    scatter.json
    assets/
      <uuid>-<sanitized-name>.<ext>
```

`scatter.json` stores a `ScatterDocument`:

- `version`: currently `1`.
- `projectName`: derived from the folder name unless set in the document.
- `updatedAt`: ISO timestamp updated on save.
- `viewport`: declared in the schema, currently written as `{ x: 0, y: 0, zoom: 1 }`.
- `nodes`: task nodes.
- `edges`: directed source-to-target links.

Each node stores:

- `id`, `type`, and canvas `position`.
- Optional `width`, `height`, and `selected`.
- `data.title`.
- `data.body`.
- `data.attachments`.
- `data.planMode`.
- `data.runMode`.
- Optional `data.lastRunAt`.

Each attachment stores:

- Original name, MIME type, size, source, and creation time.
- Absolute stored path.
- Relative `.scatter/assets/...` path.
- File URL for renderer previews.
- Kind: `image` or `file`.

Recent projects are stored in Electron `userData` as `recent-projects.json` and capped to 24 entries.

## Persistence

Project opening creates `.scatter/scatter.json` and `.scatter/assets` when needed.

Document saves are debounced in the renderer by 550 ms after node or edge changes. Saves are performed through IPC in the main process.

Attachments are copied into `.scatter/assets` and referenced from nodes. Clipboard images are encoded as PNG. Clipboard file URLs are read from macOS-compatible clipboard formats when available.

Current persistence limitations:

- React Flow viewport is not yet saved back into the document.
- Attachment deletion or cleanup is not implemented.
- Edge labels exist in the shared type but are not currently editable in the UI.

## Markdown Generation

`buildMarkdown` converts the selected execution scope into a structured prompt.

Run modes:

- `flow`: include the selected node and all downstream nodes reachable through outgoing edges.
- `node`: include only the selected node.

Ordering rules:

- Start from the selected node.
- Traverse outgoing edges.
- Sort sibling children by canvas `y` position, then `x` position.
- If cycles are detected, include a warning in the Markdown.

The generated Markdown includes:

- Task title.
- Project name and project path.
- Run mode and plan-mode status.
- Included node blocks with prompt text and attachments.
- Connection map.
- Full attachment list with relative and absolute paths.

Image attachments are also passed to Codex as local image inputs when using the desktop proxy path.

## Codex Integration

Running a node starts Codex for the selected project path and then tries two paths:

1. Desktop proxy path:
   - Use `/Applications/Codex.app/Contents/Resources/codex` when available, otherwise `codex`.
   - Connect to the Codex app-server proxy through the default control socket.
   - Initialize a Scatter client.
   - Start a Codex thread with the project folder as `cwd`.
   - Set the thread name.
   - Send text plus local image paths as the first turn.
   - Open the resulting `codex://threads/<id>` URL.

2. Desktop UI fallback:
   - Open `codex://threads/new?path=<projectPath>`.
   - Copy the generated Markdown to the clipboard.
   - Use AppleScript to paste and submit in Codex.

Plan mode prepends a Chinese instruction asking Codex to first produce a clear plan and wait for user confirmation before execution.

The proxy path currently asks Codex for:

- `approvalPolicy`: `on-request`.
- Sandbox: `workspace-write`.
- `cwd`: selected project folder.

## Visual Design

Scatter currently uses a quiet desktop-tool interface:

- Neutral canvas and surface colors.
- Compact controls and task nodes.
- Tokenized CSS variables for light and dark themes.
- Blue primary actions.
- Local system font stack with Chinese font fallbacks.
- Minimum app size of 1040 x 720.

The interface favors dense, repeatable work over a marketing-style layout. Task nodes are the main visual object, while sidebars and drawers stay secondary.

## Development Commands

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

The build command runs TypeScript checking before the Electron Vite build.

## Known Follow-ups

- Persist and restore React Flow viewport.
- Add node/edge deletion affordances if not already covered by React Flow defaults.
- Add attachment removal and asset garbage collection.
- Improve Markdown preview status when a flow contains a cycle.
- Decide whether `design.md` should evolve into product spec, architecture spec, or both.
- Add tests around Markdown flow traversal and project persistence.
