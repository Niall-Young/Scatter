import type { ReactElement } from "react";
import type { ScatterProjectInfo } from "../../../shared/types";
import { useI18n } from "../lib/i18n";
import { shortcuts } from "../lib/shortcuts";
import { shortPath } from "../lib/utils";
import { Icon } from "./ui/icon";
import { ProjectItem } from "./ui/project-item";

interface SidebarProps {
  recentProjects: ScatterProjectInfo[];
  activePath?: string;
  collapsed?: boolean;
  onCreateProject: () => void;
  onOpenRecent: (projectPath: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onRemoveRecent: (projectPath: string) => void;
}

export function Sidebar({
  recentProjects,
  activePath,
  collapsed = false,
  onCreateProject,
  onOpenRecent,
  onOpenSearch,
  onOpenSettings,
  onRemoveRecent
}: SidebarProps): ReactElement {
  const { t } = useI18n();

  return (
    <aside className="sidebar" aria-hidden={collapsed} inert={collapsed}>
      <div className="sidebar-actions">
        <button className="sidebar-action-item" type="button" onClick={onCreateProject}>
          <Icon name="folder-plus" size={16} />
          <span className="sidebar-action-label">{t("sidebar.addProject")}</span>
          <span className="kit-shortcut sidebar-action-shortcut">{shortcuts.addProject}</span>
        </button>
        <button className="sidebar-action-item" type="button" onClick={onOpenSearch}>
          <Icon name="search" size={16} />
          <span className="sidebar-action-label">{t("sidebar.search")}</span>
          <span className="kit-shortcut sidebar-action-shortcut">{shortcuts.openSearch}</span>
        </button>
        <button className="sidebar-action-item" type="button" onClick={onOpenSettings}>
          <Icon name="settings-cog" size={16} />
          <span className="sidebar-action-label">{t("sidebar.settings")}</span>
          <span className="kit-shortcut sidebar-action-shortcut">{shortcuts.openSettings}</span>
        </button>
      </div>

      <div className="sidebar-section-title">{t("sidebar.projectList")}</div>
      <div className="project-list">
        {recentProjects.map((project, index) => (
          <ProjectItem
            key={project.path}
            path={shortPath(project.path)}
            projectName={project.name}
            selected={project.path === activePath}
            unread={project.path !== activePath && index === 2}
            onClick={() => onOpenRecent(project.path)}
            onArchive={() => onRemoveRecent(project.path)}
          />
        ))}
      </div>
    </aside>
  );
}
