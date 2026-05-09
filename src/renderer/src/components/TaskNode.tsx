import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import type { EffortLevel, RunMode, ScatterNodeData } from "../../../shared/types";
import { useI18n } from "../lib/i18n";
import { shortcuts } from "../lib/shortcuts";
import { effortLabelKey } from "../lib/translations";
import { formatBytes } from "../lib/utils";
import { useScatterStore } from "../store/scatterStore";
import { ActionMenuItem } from "./ui/action-menu-item";
import { DropdownMenu, DropdownMenuItem } from "./ui/dropdown-menu";
import { DropdownTrigger } from "./ui/dropdown-trigger";
import { IconButton } from "./ui/icon-button";
import { Icon } from "./ui/icon";
import { Switch } from "./ui/switch";
import { TooltipAnchor } from "./ui/tooltip";
import { UploadChip } from "./ui/upload-chip";

type TaskNodeProps = NodeProps<Node<ScatterNodeData, "task">>;
type EditableField = "title" | "body";

const effortOptions: EffortLevel[] = ["low", "medium", "high", "xhigh"];

function fitTextareaHeight(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

interface RuntimeActions {
  updateNodeData: (nodeId: string, patch: Partial<ScatterNodeData>) => void;
  beginNodeEdit: () => void;
  commitNodeEdit: () => void;
  chooseFilesForNode: (nodeId: string) => Promise<void>;
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
  const { t } = useI18n();
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const pointerStartedSelectedRef = useRef(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const runMode = data.runMode || "flow";
  const effort = data.effort || "xhigh";
  const effortLabel = t(effortLabelKey(effort));
  const hasBody = data.body.trim().length > 0;
  const hasParent = useScatterStore((state) => state.edges.some((edge) => edge.target === id));
  const hasChild = useScatterStore((state) => state.edges.some((edge) => edge.source === id));

  const fitBodyTextarea = useCallback(() => {
    fitTextareaHeight(bodyRef.current);
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  useLayoutEffect(() => {
    fitBodyTextarea();
  }, [data.body, fitBodyTextarea]);

  useEffect(() => {
    if (!selected && editingField) {
      taskNodeActions?.commitNodeEdit();
      setEditingField(null);
    }
  }, [editingField, selected]);

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

  const startEditing = useCallback(
    (field: EditableField) => {
      if (!pointerStartedSelectedRef.current) return;
      taskNodeActions?.beginNodeEdit();
      setEditingField(field);
    },
    []
  );

  const handleEditableFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, field: EditableField) => {
    if (editingField !== field) {
      event.currentTarget.blur();
    }
  }, [editingField]);

  const handleEditableBlur = useCallback(
    (field: EditableField) => {
      if (editingField !== field) return;
      taskNodeActions?.commitNodeEdit();
      setEditingField(null);
    },
    [editingField]
  );

  const handleEditableKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }, []);

  const handleBodyChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      fitTextareaHeight(event.currentTarget);
      updateNodeInternals(id);
      taskNodeActions?.updateNodeData(id, { body: event.target.value });
    },
    [id, updateNodeInternals]
  );

  return (
    <div ref={rootRef} className={`task-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="node-handle">
        {hasParent ? (
          <span className="node-edge-cap" aria-hidden="true" />
        ) : (
          <span className="node-connect-button" aria-hidden="true">
            <Icon name="plus-lg" size={16} />
          </span>
        )}
      </Handle>
      <div className="task-node-header">
        <input
          ref={titleRef}
          className={`task-title ${editingField === "title" ? "nodrag is-editing" : "is-readonly"}`}
          value={data.title}
          placeholder={t("task.titlePlaceholder")}
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
        <TooltipAnchor className="nodrag" label={hasBody ? t("task.run") : t("task.runEmpty")} shortcut={shortcuts.runCurrentTask}>
          <IconButton
            className="nodrag"
            filled={false}
            icon="play-1"
            size="lg"
            aria-label={hasBody ? t("task.run") : t("task.runEmpty")}
            disabled={!hasBody}
            onClick={() => taskNodeActions?.runNode(id, runMode)}
          />
        </TooltipAnchor>
        <TooltipAnchor className="nodrag" label={t("task.more")}>
          <RadixDropdownMenu.Root>
            <RadixDropdownMenu.Trigger asChild>
              <IconButton className="nodrag" filled={false} icon="dots-horizontal" size="lg" aria-label={t("task.more")} />
            </RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
              <RadixDropdownMenu.Content className="dropdown-content node-action-menu" sideOffset={8} align="end">
                <RadixDropdownMenu.Item asChild>
                  <ActionMenuItem icon="play" label={t("task.runNodeOnly")} onClick={() => taskNodeActions?.runNode(id, "node")} />
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item asChild>
                  <ActionMenuItem icon="copy" label={t("task.copy")} onClick={() => taskNodeActions?.duplicateNode(id)} />
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item asChild>
                  <ActionMenuItem icon="trash" label={t("task.delete")} onClick={() => taskNodeActions?.deleteNode(id)} />
                </RadixDropdownMenu.Item>
              </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
          </RadixDropdownMenu.Root>
        </TooltipAnchor>
      </div>

      <div className="task-node-card">
        <textarea
          ref={bodyRef}
          className={`task-body ${hasBody ? "has-content" : ""} ${editingField === "body" ? "nodrag nowheel is-editing" : "is-readonly"}`}
          value={data.body}
          placeholder={t("task.bodyPlaceholder")}
          readOnly={editingField !== "body"}
          tabIndex={editingField === "body" ? 0 : -1}
          onPointerDown={handleEditablePointerDown}
          onClick={() => {
            if (editingField !== "body") startEditing("body");
          }}
          onFocus={(event) => handleEditableFocus(event, "body")}
          onBlur={() => handleEditableBlur("body")}
          onKeyDown={handleEditableKeyDown}
          onChange={handleBodyChange}
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
          <TooltipAnchor className="nodrag" label={t("task.addAttachment")}>
            <IconButton className="nodrag" filled={false} icon="plus-lg" size="lg" aria-label={t("task.addAttachment")} onClick={() => taskNodeActions?.chooseFilesForNode(id)} />
          </TooltipAnchor>
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
                      key={option}
                      label={t(effortLabelKey(option))}
                      selected={option === effort}
                      role="menuitemradio"
                      aria-checked={option === effort}
                      onClick={() => {
                        taskNodeActions?.updateNodeData(id, { effort: option });
                        setEffortMenuOpen(false);
                      }}
                    />
                  ))}
                </DropdownMenu>
              ) : null}
            </div>
            <Switch
              checked={data.planMode}
              label={t("task.planMode")}
              onCheckedChange={(checked) => taskNodeActions?.updateNodeData(id, { planMode: checked })}
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="node-handle">
        {hasChild ? <span className="node-edge-cap" aria-hidden="true" /> : null}
        <span className="node-connect-button" aria-hidden="true">
          <Icon name="plus-lg" size={16} />
        </span>
      </Handle>
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
