import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from "react";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { TooltipAnchor } from "./tooltip";

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
  const { t } = useI18n();

  function handleArchive(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onArchive?.();
  }

  return (
    <div className={cn("kit-project-item", selected && "is-selected", className)}>
      <button className="kit-project-item-main" type={type} {...props}>
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
      </button>
      {onArchive ? (
        <TooltipAnchor label={t("projectItem.remove")} side="left">
          <IconButton className="kit-project-item-archive" filled={false} icon="archive" size="sm" aria-label={t("projectItem.remove")} onClick={handleArchive} />
        </TooltipAnchor>
      ) : null}
    </div>
  );
}
