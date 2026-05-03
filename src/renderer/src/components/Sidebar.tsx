import type { ReactElement } from "react";
import type { ScatterProjectInfo } from "../../../shared/types";
import { shortPath } from "../lib/utils";
import { Icon } from "./ui/icon";
import { ProjectItem } from "./ui/project-item";

interface SidebarProps {
  recentProjects: ScatterProjectInfo[];
  activePath?: string;
  collapsed?: boolean;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (projectPath: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  recentProjects,
  activePath,
  collapsed = false,
  onCreateProject,
  onOpenProject,
  onOpenRecent,
  onOpenSettings
}: SidebarProps): ReactElement {
  return (
    <aside className="sidebar" aria-hidden={collapsed} inert={collapsed}>
      <div className="sidebar-actions">
        <button className="sidebar-action-item" type="button" onClick={onCreateProject}>
          <Icon name="folder-plus" size={16} />
          <span>添加项目</span>
        </button>
        <button className="sidebar-action-item" type="button" onClick={onOpenProject}>
          <Icon name="search" size={16} />
          <span>搜索</span>
        </button>
        <button className="sidebar-action-item" type="button" onClick={onOpenSettings}>
          <Icon name="settings-cog" size={16} />
          <span>设置</span>
        </button>
      </div>

      <div className="sidebar-section-title">项目列表</div>
      <div className="project-list">
        {recentProjects.map((project, index) => (
          <ProjectItem
            key={project.path}
            path={shortPath(project.path)}
            projectName={project.name}
            selected={project.path === activePath}
            unread={project.path !== activePath && index === 2}
            onClick={() => onOpenRecent(project.path)}
          />
        ))}
      </div>
    </aside>
  );
}
