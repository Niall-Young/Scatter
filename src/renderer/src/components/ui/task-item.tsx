import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

interface TaskItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  flow?: boolean;
  loading?: boolean;
  meta?: string;
  nodeCount?: number;
  onMessage?: () => void;
  onPlay?: () => void;
  taskName: string;
}

export function TaskItem({
  className,
  flow = false,
  loading = false,
  meta,
  nodeCount = 3,
  onMessage,
  onPlay,
  taskName,
  type = "button",
  ...props
}: TaskItemProps): ReactElement {
  function handleAction(event: MouseEvent<HTMLSpanElement>, action?: () => void): void {
    event.stopPropagation();
    action?.();
  }

  return (
    <button className={cn("kit-task-item", className)} type={type} {...props}>
      <span className="kit-task-item-leading">
        {loading ? <span className="kit-spinner kit-task-item-spinner" aria-hidden="true" /> : <Icon name={flow ? "add-sources" : "connect-apps"} size={16} />}
      </span>
      <span className="kit-task-item-content">
        <span className="kit-task-item-name">{taskName}</span>
        <span className="kit-task-item-meta">{meta || (flow ? `${nodeCount} nodes` : "Ready for play")}</span>
      </span>
      <span className="kit-task-item-actions">
        <span className="kit-task-item-action" role="button" tabIndex={-1} aria-label="运行任务" onClick={(event) => handleAction(event, onPlay)}>
          <Icon name="play" size={16} />
        </span>
        <span className="kit-task-item-action" role="button" tabIndex={-1} aria-label="发送到对话" onClick={(event) => handleAction(event, onMessage)}>
          <Icon name="messaging" size={16} />
        </span>
      </span>
    </button>
  );
}
