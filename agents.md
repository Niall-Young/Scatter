# Scatter Agent Notes

Last updated: 2026-05-02

This file is the working guide for future agents editing Scatter. Keep it current when architecture, commands, or conventions change.

## Project Summary

Scatter is a local Electron desktop app that turns a canvas of task nodes into structured Codex prompts. The app stores project state in the user's chosen folder under `.scatter`, copies attachments into `.scatter/assets`, and sends generated Markdown plus image inputs to Codex Desktop.

Primary stack:

- Electron 39 with Electron Vite.
- React 19 and TypeScript.
- React Flow for the canvas.
- Zustand for renderer state.
- Radix UI for dropdowns and switches.
- Local SVG icon registry in `src/renderer/src/components/ui/icon.tsx`.

## Commands

Use these from the repository root:

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

Minimum verification for code changes is `npm run typecheck`. For UI behavior changes, run the app with `npm run dev` and manually verify the relevant flow.

## Repository Map

- `package.json`: scripts and dependencies.
- `electron.vite.config.ts`: main, preload, and renderer build entry points.
- `tsconfig.json`: strict TypeScript configuration.
- `src/shared/types.ts`: shared contracts across main, preload, and renderer.
- `src/main/index.ts`: Electron app bootstrap and IPC registration.
- `src/main/projectStore.ts`: project document, recent projects, and attachment persistence.
- `src/main/codexBridge.ts`: Codex Desktop integration.
- `src/preload/index.ts`: typed `window.scatter` API.
- `src/renderer/src/App.tsx`: top-level renderer behavior.
- `src/renderer/src/store/scatterStore.ts`: Zustand state and state mutators.
- `src/renderer/src/lib/markdown.ts`: execution-scope traversal and Markdown generation.
- `src/renderer/src/components`: UI components.
- `src/renderer/src/components/ui`: shared primitives.
- `src/renderer/src/styles/app.css`: design tokens and app styles.

## Editing Rules

- Preserve user work. This repository may have unrelated uncommitted changes.
- Keep changes scoped to the requested behavior.
- Prefer updating shared types first when data contracts change.
- Do not use Node APIs directly in the renderer. Route privileged work through preload IPC and main-process handlers.
- Keep project data local to the selected folder unless a feature explicitly requires something else.
- Keep persisted project schema backward-compatible when possible; hydrate missing fields in `projectStore.ts`.
- Use the existing CSS variables and component primitives before adding new styling patterns.
- Keep UI text consistent with the current Chinese-first interface.
- Use existing `Icon` names or add SVG assets under `src/renderer/src/assets/icons` when needed.

## Common Change Paths

For a data model change:

- Update `src/shared/types.ts`.
- Update defaults and hydration in `src/main/projectStore.ts`.
- Update renderer state in `src/renderer/src/store/scatterStore.ts`.
- Update save/load usage in `src/renderer/src/App.tsx`.
- Update Markdown conversion if Codex output context changes.
- Update `design.md` and this file.

For a new IPC capability:

- Add the main handler in `src/main/index.ts`.
- Implement privileged logic in a main-process module.
- Expose a typed function in `src/preload/index.ts`.
- Update renderer type declarations if needed.
- Call the API through `window.scatter`.

For Markdown or execution-scope changes:

- Start in `src/renderer/src/lib/markdown.ts`.
- Verify `flow` and `node` modes.
- Check cycle behavior.
- Ensure attachment paths remain explicit and useful to Codex.

For Codex launch behavior:

- Start in `src/main/codexBridge.ts`.
- Preserve the desktop proxy path and UI fallback unless intentionally replacing both.
- Be careful with macOS automation requirements in the AppleScript fallback.
- Keep `cwd` set to the selected project folder.

For visual changes:

- Start with `src/renderer/src/styles/app.css`.
- Reuse `Button`, `Switch`, and `Icon`.
- Keep the app dense and tool-like.
- Verify the welcome screen, canvas, task node, right drawer, and dark mode.

## Current Behavior to Preserve

- Opening or creating a folder initializes `.scatter/scatter.json` and `.scatter/assets`.
- Recent projects are stored in Electron `userData`, not inside every project.
- Autosave runs after canvas changes with a short debounce.
- Attachments are copied into the project before being referenced by nodes.
- Double-clicking an attachment chip reveals it in Finder.
- Plan mode changes the Codex prompt, not the local document structure.
- `flow` mode includes downstream nodes; `node` mode includes only the selected node.
- Markdown export copies the current generated Markdown to the clipboard.

## Known Risks and Gaps

- Viewport exists in the document schema but is not currently persisted from React Flow.
- There is no attachment removal or asset cleanup path.
- There are no automated tests yet for project persistence or Markdown traversal.
- The Codex UI fallback depends on macOS Accessibility permission for automated paste and submit.
- The app has a desktop minimum size and is not designed as a responsive mobile web app.

## Documentation Maintenance

When changing product behavior or architecture:

- Update `design.md` for product, architecture, data, or workflow changes.
- Update `agents.md` for commands, conventions, or repo navigation changes.
- Keep both documents descriptive rather than speculative.
