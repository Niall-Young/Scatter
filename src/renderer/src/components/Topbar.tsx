import type { ReactElement } from "react";
import { IconButton } from "./ui/icon-button";

interface TopbarProps {
  canRun: boolean;
  disabled?: boolean;
  onRunActive: () => void;
  onOpenTasks: () => void;
  onOpenMarkdown: () => void;
}

export function Topbar({
  canRun,
  disabled = false,
  onRunActive,
  onOpenTasks,
  onOpenMarkdown
}: TopbarProps): ReactElement {
  return (
    <header className="topbar" aria-label="窗口操作">
      <div className="window-drag-region" />
      <div className="topbar-leading">
        <IconButton className="topbar-icon-button" filled={false} icon="topbar-sidebar-expand" size="md" aria-label="展开侧边栏" />
      </div>
      <div className="topbar-actions">
        <IconButton className="topbar-icon-button" filled={false} icon="topbar-play" size="md" aria-label="运行当前任务" disabled={!canRun || disabled} onClick={onRunActive} />
        <IconButton className="topbar-icon-button" filled={false} icon="topbar-tasks" size="md" aria-label="任务列表" disabled={disabled} onClick={onOpenTasks} />
        <IconButton className="topbar-icon-button" filled={false} icon="topbar-sidebar-right-expand" size="md" aria-label="打开右侧面板" disabled={disabled} onClick={onOpenMarkdown} />
      </div>
    </header>
  );
}
