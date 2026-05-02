import type { ReactElement } from "react";
import type { ScatterProjectInfo } from "../../../shared/types";
import { shortPath } from "../lib/utils";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";

interface SidebarProps {
  recentProjects: ScatterProjectInfo[];
  activePath?: string;
  theme: "light" | "dark";
  onCreateProject: () => void;
  onOpenProject: () => void;
  onOpenRecent: (projectPath: string) => void;
  onToggleTheme: () => void;
}

export function Sidebar({
  recentProjects,
  activePath,
  theme,
  onCreateProject,
  onOpenProject,
  onOpenRecent,
  onToggleTheme
}: SidebarProps): ReactElement {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="layers" size={18} />
        </div>
        <div>
          <strong>Scatter</strong>
          <span>Local canvas</span>
        </div>
      </div>

      <div className="sidebar-actions">
        <Button variant="primary" onClick={onCreateProject}>
          <Icon name="folder-plus" size={16} />
          <span>新建项目</span>
        </Button>
        <Button onClick={onOpenProject}>
          <Icon name="folder-open" size={16} />
          <span>打开项目</span>
        </Button>
      </div>

      <div className="sidebar-section-title">本地项目</div>
      <div className="project-list">
        {recentProjects.length === 0 ? (
          <p className="empty-copy">还没有打开过的 Scatter 项目。</p>
        ) : (
          recentProjects.map((project) => (
            <button
              key={project.path}
              type="button"
              className={`project-item ${project.path === activePath ? "active" : ""}`}
              onClick={() => onOpenRecent(project.path)}
            >
              <strong>{project.name}</strong>
              <span>{shortPath(project.path)}</span>
            </button>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <Button variant="ghost" onClick={onToggleTheme}>
          <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
          <span>{theme === "light" ? "深色模式" : "浅色模式"}</span>
        </Button>
      </div>
    </aside>
  );
}
