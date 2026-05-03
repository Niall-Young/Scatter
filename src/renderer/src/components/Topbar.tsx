import type { ReactElement } from "react";
import { IconButton } from "./ui/icon-button";

interface TopbarProps {
  canRun: boolean;
  onRunActive: () => void;
  onOpenTasks: () => void;
  onOpenMarkdown: () => void;
}

export function Topbar({
  canRun,
  onRunActive,
  onOpenTasks,
  onOpenMarkdown
}: TopbarProps): ReactElement {
  return (
    <header className="topbar" aria-label="窗口操作">
      <div className="window-drag-region" />
      <div className="topbar-leading">
        <IconButton className="topbar-icon-button" filled={false} icon="sidebar-expand" size="md" aria-label="展开侧边栏" />
      </div>
      <div className="topbar-actions">
        <IconButton className="topbar-icon-button" filled={false} icon="play" size="md" aria-label="运行当前任务" disabled={!canRun} onClick={onRunActive} />
        <IconButton className="topbar-icon-button" filled={false} icon="tasks" size="md" aria-label="任务列表" onClick={onOpenTasks} />
        <IconButton className="topbar-icon-button" filled={false} icon="sidebar-right-expand" size="md" aria-label="打开右侧面板" onClick={onOpenMarkdown} />
      </div>
    </header>
  );
}
