import { memo, useCallback, type ReactElement } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, FileText, ImageIcon, Paperclip, Play } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { RunMode, ScatterNodeData } from "../../../shared/types";
import { formatBytes } from "../lib/utils";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

type TaskNodeProps = NodeProps<Node<ScatterNodeData, "task">>;

interface RuntimeActions {
  updateNodeData: (nodeId: string, patch: Partial<ScatterNodeData>) => void;
  addFilesToNode: (nodeId: string, files: FileList | File[], source: "upload" | "drop" | "paste") => Promise<void>;
  runNode: (nodeId: string, mode: RunMode) => Promise<void>;
}

export let taskNodeActions: RuntimeActions | null = null;

export function setTaskNodeActions(actions: RuntimeActions): void {
  taskNodeActions = actions;
}

function TaskNodeComponent({ id, data, selected }: TaskNodeProps): ReactElement {
  const onUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      await taskNodeActions?.addFilesToNode(id, event.target.files, "upload");
      event.target.value = "";
    },
    [id]
  );

  const runMode = data.runMode || "flow";

  return (
    <div className={`task-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="node-handle" />
      <div className="task-node-header">
        <input
          className="task-title nodrag"
          value={data.title}
          placeholder="Untitled task"
          onChange={(event) => taskNodeActions?.updateNodeData(id, { title: event.target.value })}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button className="nodrag" variant="ghost" size="icon" title="Run mode">
              <ChevronDown size={15} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-content" sideOffset={8}>
              <DropdownMenu.Item
                className="dropdown-item"
                onClick={() => taskNodeActions?.updateNodeData(id, { runMode: "flow" })}
              >
                运行该节点及子节点
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="dropdown-item"
                onClick={() => taskNodeActions?.updateNodeData(id, { runMode: "node" })}
              >
                仅运行该节点
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <textarea
        className="task-body nodrag"
        value={data.body}
        placeholder="输入任务提示词、业务想法或执行上下文..."
        onChange={(event) => taskNodeActions?.updateNodeData(id, { body: event.target.value })}
      />

      <div className="attachment-grid">
        {data.attachments.map((attachment) => (
          <button
            key={attachment.id}
            type="button"
            className="attachment-chip nodrag"
            title={attachment.storedPath}
            onDoubleClick={() => window.scatter.showInFolder(attachment.storedPath)}
          >
            {attachment.kind === "image" ? (
              <img src={attachment.fileUrl} alt={attachment.originalName} />
            ) : (
              <FileText size={15} />
            )}
            <span>{attachment.originalName}</span>
            <small>{formatBytes(attachment.size)}</small>
          </button>
        ))}
      </div>

      <div className="task-node-footer">
        <label className="attach-button nodrag">
          <Paperclip size={15} />
          <span>附件</span>
          <input type="file" multiple onChange={onUpload} />
        </label>
        <Switch
          checked={data.planMode}
          label="计划"
          onCheckedChange={(checked) => taskNodeActions?.updateNodeData(id, { planMode: checked })}
        />
        <Button className="nodrag run-node-button" variant="primary" size="sm" onClick={() => taskNodeActions?.runNode(id, runMode)}>
          <Play size={14} />
          <span>{runMode === "flow" ? "运行流程" : "运行节点"}</span>
        </Button>
      </div>
      <div className="node-mode-caption">
        {runMode === "flow" ? "默认发送当前节点及所有子节点" : "只发送当前节点内容"}
      </div>
      <Handle type="source" position={Position.Right} className="node-handle" />
      {data.attachments.some((item) => item.kind === "image") ? <ImageIcon className="node-corner-icon" size={16} /> : null}
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
