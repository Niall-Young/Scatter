import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

interface ProjectItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  onArchive?: () => void;
  path: string;
  projectName: string;
  selected?: boolean;
  unread?: boolean;
}

export function ProjectItem({
  className,
  loading = false,
  onArchive,
  path,
  projectName,
  selected = false,
  type = "button",
  unread = false,
  ...props
}: ProjectItemProps): ReactElement {
  function handleArchive(event: MouseEvent<HTMLSpanElement>): void {
    event.stopPropagation();
    onArchive?.();
  }

  return (
    <button className={cn("kit-project-item", selected && "is-selected", className)} type={type} {...props}>
      <span className="kit-project-item-leading">
        {loading ? (
          <span className="kit-spinner kit-project-item-spinner" aria-hidden="true" />
        ) : (
          <>
            <Icon name={selected ? "folder-open" : "folder"} size={16} />
            {!selected && unread ? <span className="kit-project-item-badge" /> : null}
          </>
        )}
      </span>
      <span className="kit-project-item-content">
        <span className="kit-project-item-name">{projectName}</span>
        <span className="kit-project-item-path">{path}</span>
      </span>
      {onArchive ? (
        <span className="kit-project-item-archive" role="button" tabIndex={-1} aria-label="归档项目" onClick={handleArchive}>
          <Icon name="archive" size={16} />
        </span>
      ) : null}
    </button>
  );
}
