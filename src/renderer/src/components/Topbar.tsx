import type { ReactElement } from "react";
import { IconButton } from "./ui/icon-button";

interface TopbarProps {
  activeDrawer: "tasks" | "markdown" | null;
  canRun: boolean;
  sidebarCollapsed: boolean;
  disabled?: boolean;
  onCreateProject: () => void;
  onRunActive: () => void;
  onOpenTasks: () => void;
  onOpenMarkdown: () => void;
  onToggleSidebar: () => void;
}

export function Topbar({
  activeDrawer,
  canRun,
  sidebarCollapsed,
  disabled = false,
  onCreateProject,
  onRunActive,
  onOpenTasks,
  onOpenMarkdown,
  onToggleSidebar
}: TopbarProps): ReactElement {
  return (
    <header className="topbar" aria-label="窗口操作">
      <div className="window-drag-region" />
      <div className="topbar-leading">
        <IconButton
          className="topbar-icon-button topbar-leading-button"
          filled={false}
          icon={sidebarCollapsed ? "topbar-sidebar" : "topbar-sidebar-expand"}
          size="md"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-pressed={sidebarCollapsed}
          onClick={onToggleSidebar}
        />
        {sidebarCollapsed ? (
          <IconButton className="topbar-icon-button topbar-leading-button" filled={false} icon="topbar-folder-plus" size="md" aria-label="添加项目" onClick={onCreateProject} />
        ) : null}
      </div>
      <div className="topbar-actions">
        <IconButton className="topbar-icon-button" filled={false} icon="topbar-play" size="md" aria-label="运行当前任务" disabled={!canRun || disabled} onClick={onRunActive} />
        <IconButton
          className={`topbar-icon-button ${activeDrawer === "tasks" ? "is-selected" : ""}`}
          filled={false}
          icon="topbar-tasks"
          size="md"
          aria-label="任务列表"
          aria-pressed={activeDrawer === "tasks"}
          disabled={disabled}
          onClick={onOpenTasks}
        />
        <IconButton
          className={`topbar-icon-button ${activeDrawer === "markdown" ? "is-selected" : ""}`}
          filled={false}
          icon="topbar-sidebar-right-expand"
          size="md"
          aria-label="打开右侧面板"
          aria-pressed={activeDrawer === "markdown"}
          disabled={disabled}
          onClick={onOpenMarkdown}
        />
      </div>
    </header>
  );
}
