import { memo, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import type { EffortLevel, RunMode, ScatterNodeData } from "../../../shared/types";
import { formatBytes } from "../lib/utils";
import { useScatterStore } from "../store/scatterStore";
import { ActionMenuItem } from "./ui/action-menu-item";
import { DropdownMenu, DropdownMenuItem } from "./ui/dropdown-menu";
import { DropdownTrigger } from "./ui/dropdown-trigger";
import { IconButton } from "./ui/icon-button";
import { Icon } from "./ui/icon";
import { Switch } from "./ui/switch";
import { UploadChip } from "./ui/upload-chip";

type TaskNodeProps = NodeProps<Node<ScatterNodeData, "task">>;
type EditableField = "title" | "body";

const effortOptions: Array<{ label: string; value: EffortLevel }> = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
  { label: "极高", value: "xhigh" }
];

interface RuntimeActions {
  updateNodeData: (nodeId: string, patch: Partial<ScatterNodeData>) => void;
  addFilesToNode: (nodeId: string, files: FileList | File[], source: "upload" | "drop" | "paste") => Promise<void>;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  duplicateNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
  runNode: (nodeId: string, mode: RunMode) => Promise<void>;
}

export let taskNodeActions: RuntimeActions | null = null;

export function setTaskNodeActions(actions: RuntimeActions): void {
  taskNodeActions = actions;
}

function TaskNodeComponent({ id, data, selected }: TaskNodeProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const pointerStartedSelectedRef = useRef(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const onUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      await taskNodeActions?.addFilesToNode(id, event.target.files, "upload");
      event.target.value = "";
    },
    [id]
  );

  const runMode = data.runMode || "flow";
  const effort = data.effort || "xhigh";
  const effortLabel = effortOptions.find((option) => option.value === effort)?.label || "极高";
  const hasBody = data.body.trim().length > 0;
  const hasParent = useScatterStore((state) => state.edges.some((edge) => edge.target === id));

  useEffect(() => {
    if (!selected) setEditingField(null);
  }, [selected]);

  useEffect(() => {
    if (editingField === "title") {
      titleRef.current?.focus();
      const valueLength = titleRef.current?.value.length ?? 0;
      titleRef.current?.setSelectionRange(valueLength, valueLength);
      return;
    }

    if (editingField === "body") {
      bodyRef.current?.focus();
      const valueLength = bodyRef.current?.value.length ?? 0;
      bodyRef.current?.setSelectionRange(valueLength, valueLength);
    }
  }, [editingField]);

  useEffect(() => {
    if (!effortMenuOpen) return;

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setEffortMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [effortMenuOpen]);

  const handleEditablePointerDown = useCallback(() => {
    pointerStartedSelectedRef.current = selected;
  }, [selected]);

  const startEditing = useCallback((field: EditableField) => {
    if (!pointerStartedSelectedRef.current) return;
    setEditingField(field);
  }, []);

  const handleEditableFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, field: EditableField) => {
    if (editingField !== field) {
      event.currentTarget.blur();
    }
  }, [editingField]);

  const handleEditableBlur = useCallback((field: EditableField) => {
    setEditingField((current) => (current === field ? null : current));
  }, []);

  const handleEditableKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }, []);

  return (
    <div ref={rootRef} className={`task-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="node-handle">
        {!hasParent ? (
          <span className="node-connect-button" aria-hidden="true">
            <Icon name="plus-lg" size={16} />
          </span>
        ) : null}
      </Handle>
      <div className="task-node-header">
        <input
          ref={titleRef}
          className={`task-title ${editingField === "title" ? "nodrag is-editing" : "is-readonly"}`}
          value={data.title}
          placeholder="任务标题"
          readOnly={editingField !== "title"}
          tabIndex={editingField === "title" ? 0 : -1}
          onPointerDown={handleEditablePointerDown}
          onClick={() => {
            if (editingField !== "title") startEditing("title");
          }}
          onFocus={(event) => handleEditableFocus(event, "title")}
          onBlur={() => handleEditableBlur("title")}
          onKeyDown={handleEditableKeyDown}
          onChange={(event) => taskNodeActions?.updateNodeData(id, { title: event.target.value })}
        />
        <IconButton
          className="nodrag"
          filled={false}
          icon="play-1"
          size="lg"
          aria-label={hasBody ? "运行当前任务" : "提示词为空，无法运行"}
          disabled={!hasBody}
          onClick={() => taskNodeActions?.runNode(id, runMode)}
        />
        <RadixDropdownMenu.Root>
          <RadixDropdownMenu.Trigger asChild>
            <IconButton className="nodrag" filled={false} icon="dots-horizontal" size="lg" aria-label="更多操作" />
          </RadixDropdownMenu.Trigger>
          <RadixDropdownMenu.Portal>
            <RadixDropdownMenu.Content className="dropdown-content node-action-menu" sideOffset={8} align="end">
              <RadixDropdownMenu.Item asChild>
                <ActionMenuItem icon="play" label="仅运行当前节点" onClick={() => taskNodeActions?.runNode(id, "node")} />
              </RadixDropdownMenu.Item>
              <RadixDropdownMenu.Item asChild>
                <ActionMenuItem icon="copy" label="复制" onClick={() => taskNodeActions?.duplicateNode(id)} />
              </RadixDropdownMenu.Item>
              <RadixDropdownMenu.Item asChild>
                <ActionMenuItem icon="trash" label="删除" onClick={() => taskNodeActions?.deleteNode(id)} />
              </RadixDropdownMenu.Item>
            </RadixDropdownMenu.Content>
          </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
      </div>

      <div className="task-node-card">
        <textarea
          ref={bodyRef}
          className={`task-body ${hasBody ? "has-content" : ""} ${editingField === "body" ? "nodrag nowheel is-editing" : "is-readonly"}`}
          value={data.body}
          placeholder="请输入提示词内容"
          readOnly={editingField !== "body"}
          tabIndex={editingField === "body" ? 0 : -1}
          onPointerDown={handleEditablePointerDown}
          onClick={() => {
            if (editingField !== "body") startEditing("body");
          }}
          onFocus={(event) => handleEditableFocus(event, "body")}
          onBlur={() => handleEditableBlur("body")}
          onKeyDown={handleEditableKeyDown}
          onChange={(event) => taskNodeActions?.updateNodeData(id, { body: event.target.value })}
        />

        {data.attachments.length ? (
          <div className="attachment-grid">
            {data.attachments.map((attachment) => (
              <UploadChip
                key={attachment.id}
                className="nodrag"
                fileName={attachment.originalName}
                imageAlt={attachment.originalName}
                imageSrc={attachment.kind === "image" ? attachment.fileUrl : undefined}
                kind={attachment.kind}
                title={`${attachment.storedPath} · ${formatBytes(attachment.size)}`}
                onDoubleClick={() => window.scatter.showInFolder(attachment.storedPath)}
                onRemove={() => {
                  taskNodeActions?.removeAttachment(id, attachment.id);
                }}
              />
            ))}
          </div>
        ) : null}

        <div className="task-node-footer">
          <input ref={fileInputRef} className="task-node-file-input" type="file" multiple onChange={onUpload} />
          <IconButton className="nodrag" filled={false} icon="plus-lg" size="lg" aria-label="添加附件" onClick={() => fileInputRef.current?.click()} />
          <div className="task-node-settings">
            <div className="task-node-effort-picker">
              <DropdownTrigger
                className="nodrag"
                label={effortLabel}
                size="lg"
                aria-haspopup="menu"
                aria-expanded={effortMenuOpen}
                onClick={() => setEffortMenuOpen((open) => !open)}
              />
              {effortMenuOpen ? (
                <DropdownMenu className="task-node-effort-menu" role="menu">
                  {effortOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      label={option.label}
                      selected={option.value === effort}
                      role="menuitemradio"
                      aria-checked={option.value === effort}
                      onClick={() => {
                        taskNodeActions?.updateNodeData(id, { effort: option.value });
                        setEffortMenuOpen(false);
                      }}
                    />
                  ))}
                </DropdownMenu>
              ) : null}
            </div>
            <Switch
              checked={data.planMode}
              label="计划模式"
              onCheckedChange={(checked) => taskNodeActions?.updateNodeData(id, { planMode: checked })}
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="node-handle">
        <span className="node-connect-button" aria-hidden="true">
          <Icon name="plus-lg" size={16} />
        </span>
      </Handle>
      {data.attachments.some((item) => item.kind === "image") ? <Icon name="image-icon" className="node-corner-icon" size={16} /> : null}
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
