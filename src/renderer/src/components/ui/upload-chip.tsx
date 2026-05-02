import type { HTMLAttributes, KeyboardEvent, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

interface UploadChipProps extends HTMLAttributes<HTMLDivElement> {
  fileName: string;
  imageAlt?: string;
  imageSrc?: string;
  kind?: "file" | "image";
  onOpen?: () => void;
  onRemove?: () => void;
}

export function UploadChip({ className, fileName, imageAlt = "", imageSrc, kind = "file", onOpen, onRemove, ...props }: UploadChipProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || !onOpen) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      {...props}
      className={cn("kit-upload-chip", onOpen && "is-clickable", onRemove && "has-remove", className)}
      role={onOpen ? "button" : props.role}
      tabIndex={onOpen ? 0 : props.tabIndex}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) onOpen?.();
      }}
      onKeyDown={handleKeyDown}
    >
      {kind === "image" ? (
        <span className="kit-upload-chip-thumbnail" aria-hidden="true">
          {imageSrc ? <img alt={imageAlt} src={imageSrc} /> : <span className="kit-upload-chip-thumbnail-empty" />}
        </span>
      ) : (
        <span className="kit-upload-chip-file-icon" aria-hidden="true">
          <Icon name="analyze-data" size={16} />
        </span>
      )}
      <span className="kit-upload-chip-label">{fileName}</span>
      {onRemove ? (
        <button
          className="kit-upload-chip-remove"
          type="button"
          aria-label="移除文件"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="x-xs" size={16} />
        </button>
      ) : null}
    </div>
  );
}
