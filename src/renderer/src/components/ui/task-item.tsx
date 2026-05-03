import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

interface TaskItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  canRun?: boolean;
  flow?: boolean;
  loading?: boolean;
  meta?: string;
  nodeCount?: number;
  onLocate?: () => void;
  onPlay?: () => void;
  taskName: string;
}

export function TaskItem({
  canRun = true,
  className,
  flow = false,
  loading = false,
  meta,
  nodeCount = 3,
  onLocate,
  onPlay,
  taskName,
  type = "button",
  ...props
}: TaskItemProps): ReactElement {
  function handleAction(event: MouseEvent<HTMLSpanElement>, action?: () => void, disabled = false): void {
    event.stopPropagation();
    if (disabled) return;
    action?.();
  }

  return (
    <button className={cn("kit-task-item", className)} type={type} {...props}>
      <span className="kit-task-item-leading">
        {loading ? <span className="kit-spinner kit-task-item-spinner" aria-hidden="true" /> : <Icon name={flow ? "add-sources" : "connect-apps"} size={16} />}
      </span>
      <span className="kit-task-item-content">
        <span className="kit-task-item-name">{taskName}</span>
        <span className="kit-task-item-meta">{meta || (flow ? `${nodeCount} 个节点` : "可发送给 Codex")}</span>
      </span>
      <span className="kit-task-item-actions">
        <span
          className={cn("kit-task-item-action", !canRun && "is-disabled")}
          role="button"
          tabIndex={-1}
          aria-disabled={!canRun}
          aria-label="运行任务"
          onClick={(event) => handleAction(event, onPlay, !canRun)}
        >
          <Icon name="play" size={16} />
        </span>
        <span className="kit-task-item-action" role="button" tabIndex={-1} aria-label="定位节点" onClick={(event) => handleAction(event, onLocate)}>
          <Icon name="map-pin" size={16} />
        </span>
      </span>
    </button>
  );
}
