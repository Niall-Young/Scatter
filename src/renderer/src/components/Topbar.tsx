import type { ReactElement } from "react";
import { useI18n } from "../lib/i18n";
import { shortcuts } from "../lib/shortcuts";
import { IconButton } from "./ui/icon-button";
import { TooltipAnchor } from "./ui/tooltip";

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
  const { t } = useI18n();

  return (
    <header className="topbar" aria-label={t("topbar.windowActions")}>
      <div className="window-drag-region" />
      <div className="topbar-leading">
        <TooltipAnchor label={sidebarCollapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")} shortcut={shortcuts.toggleSidebar} side="bottom" align="start">
          <IconButton
            className="topbar-icon-button topbar-leading-button"
            filled={false}
            icon={sidebarCollapsed ? "topbar-sidebar" : "topbar-sidebar-expand"}
            size="md"
            aria-label={sidebarCollapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")}
            aria-pressed={sidebarCollapsed}
            onClick={onToggleSidebar}
          />
        </TooltipAnchor>
        {sidebarCollapsed ? (
          <TooltipAnchor label={t("topbar.addProject")} side="bottom" align="start">
            <IconButton className="topbar-icon-button topbar-leading-button" filled={false} icon="topbar-folder-plus" size="md" aria-label={t("topbar.addProject")} onClick={onCreateProject} />
          </TooltipAnchor>
        ) : null}
      </div>
      <div className="topbar-actions">
        <TooltipAnchor label={t("topbar.runCurrentTask")} shortcut={shortcuts.runCurrentTask} side="bottom">
          <IconButton className="topbar-icon-button" filled={false} icon="topbar-play" size="md" aria-label={t("topbar.runCurrentTask")} disabled={!canRun || disabled} onClick={onRunActive} />
        </TooltipAnchor>
        <TooltipAnchor label={t("topbar.taskList")} shortcut={shortcuts.taskList} side="bottom">
          <IconButton
            className={`topbar-icon-button ${activeDrawer === "tasks" ? "is-selected" : ""}`}
            filled={false}
            icon="topbar-tasks"
            size="md"
            aria-label={t("topbar.taskList")}
            aria-pressed={activeDrawer === "tasks"}
            disabled={disabled}
            onClick={onOpenTasks}
          />
        </TooltipAnchor>
        <TooltipAnchor label={t("topbar.openMarkdown")} shortcut={shortcuts.openMarkdown} side="bottom" align="end">
          <IconButton
            className={`topbar-icon-button ${activeDrawer === "markdown" ? "is-selected" : ""}`}
            filled={false}
            icon="topbar-sidebar-right-expand"
            size="md"
            aria-label={t("topbar.openMarkdown")}
            aria-pressed={activeDrawer === "markdown"}
            disabled={disabled}
            onClick={onOpenMarkdown}
          />
        </TooltipAnchor>
      </div>
    </header>
  );
}
