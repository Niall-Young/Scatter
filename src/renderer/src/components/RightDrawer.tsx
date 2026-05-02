import { Clipboard, ExternalLink, ListChecks, X } from "lucide-react";
import type { ReactElement } from "react";
import type { RunMode, ScatterEdge, ScatterNode } from "../../../shared/types";
import { childCount } from "../lib/markdown";
import { formatBytes } from "../lib/utils";
import { Button } from "./ui/button";

interface RightDrawerProps {
  drawer: "tasks" | "markdown" | null;
  nodes: ScatterNode[];
  edges: ScatterEdge[];
  selectedNodeId: string | null;
  markdown: string;
  currentRunMode: RunMode;
  onClose: () => void;
  onSelectNode: (nodeId: string) => void;
  onRunNode: (nodeId: string, mode: RunMode) => void;
}

export function RightDrawer({
  drawer,
  nodes,
  edges,
  selectedNodeId,
  markdown,
  currentRunMode,
  onClose,
  onSelectNode,
  onRunNode
}: RightDrawerProps): ReactElement | null {
  if (!drawer) return null;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  return (
    <aside className="right-drawer">
      <div className="drawer-header">
        <div>
          <strong>{drawer === "tasks" ? "任务清单" : "Markdown 预览"}</strong>
          <span>{drawer === "tasks" ? `${nodes.length} 个节点任务` : selectedNode?.data.title || "未选中节点"}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      {drawer === "tasks" ? (
        <div className="task-list">
          {nodes.length === 0 ? (
            <p className="empty-copy">画布中还没有任务节点。</p>
          ) : (
            nodes.map((node) => (
              <button
                key={node.id}
                className={`task-list-item ${node.id === selectedNodeId ? "active" : ""}`}
                type="button"
                onClick={() => onSelectNode(node.id)}
              >
                <div className="task-list-main">
                  <strong>{node.data.title || "Untitled task"}</strong>
                  <span>{node.data.body || "No prompt text"}</span>
                </div>
                <div className="task-list-meta">
                  <span>{node.data.attachments.length} 附件</span>
                  <span>{childCount(node.id, edges)} 子节点</span>
                  {node.data.planMode ? <span>计划模式</span> : null}
                </div>
                <div className="task-list-run">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRunNode(node.id, node.data.runMode || "flow");
                    }}
                  >
                    <ListChecks size={14} />
                    <span>运行</span>
                  </Button>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="markdown-pane">
          <div className="markdown-toolbar">
            <div>
              <strong>{currentRunMode === "flow" ? "节点及子节点" : "仅当前节点"}</strong>
              <span>
                {selectedNode
                  ? `${selectedNode.data.attachments.reduce((sum, item) => sum + item.size, 0) ? formatBytes(selectedNode.data.attachments.reduce((sum, item) => sum + item.size, 0)) : "无附件"}`
                  : "选择一个节点后预览"}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(markdown);
              }}
            >
              <Clipboard size={16} />
              <span>复制</span>
            </Button>
          </div>
          <pre>{markdown || "选择一个节点后，这里会显示发送给 Codex 的 Markdown。"}</pre>
          {selectedNode ? (
            <Button variant="primary" onClick={() => onRunNode(selectedNode.id, currentRunMode)}>
              <ExternalLink size={16} />
              <span>发送到 Codex</span>
            </Button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
