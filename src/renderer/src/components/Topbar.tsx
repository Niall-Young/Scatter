import { FileDown, ListChecks, PanelRightOpen, Plus, Save } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "./ui/button";

interface TopbarProps {
  projectName?: string;
  taskCount: number;
  isSaving: boolean;
  status: string;
  onAddNode: () => void;
  onOpenTasks: () => void;
  onOpenMarkdown: () => void;
  onExportMarkdown: () => void;
}

export function Topbar({
  projectName,
  taskCount,
  isSaving,
  status,
  onAddNode,
  onOpenTasks,
  onOpenMarkdown,
  onExportMarkdown
}: TopbarProps): ReactElement {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>{projectName || "未打开项目"}</strong>
        <span>{taskCount} 个任务</span>
      </div>
      <div className="topbar-status">
        <Save size={14} />
        <span>{isSaving ? "保存中" : status}</span>
      </div>
      <div className="topbar-actions">
        <Button variant="secondary" onClick={onAddNode}>
          <Plus size={16} />
          <span>新建节点</span>
        </Button>
        <Button variant="ghost" onClick={onOpenTasks}>
          <ListChecks size={16} />
          <span>任务清单</span>
        </Button>
        <Button variant="ghost" onClick={onOpenMarkdown}>
          <PanelRightOpen size={16} />
          <span>预览 MD</span>
        </Button>
        <Button variant="ghost" onClick={onExportMarkdown}>
          <FileDown size={16} />
          <span>导出</span>
        </Button>
      </div>
    </header>
  );
}
