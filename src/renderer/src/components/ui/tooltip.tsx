import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface TooltipProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  shortcut?: string;
}

export function Tooltip({ children, className, shortcut, ...props }: TooltipProps): ReactElement {
  return (
    <div className={cn("kit-tooltip", shortcut && "has-shortcut", className)} role="tooltip" {...props}>
      <span>{children}</span>
      {shortcut ? <span className="kit-shortcut is-sunken">{shortcut}</span> : null}
    </div>
  );
}

interface TooltipAnchorProps extends HTMLAttributes<HTMLSpanElement> {
  align?: "start" | "center" | "end";
  children: ReactNode;
  label: ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  tooltipClassName?: string;
}

export function TooltipAnchor({
  align = "center",
  children,
  className,
  label,
  shortcut,
  side = "top",
  tooltipClassName,
  ...props
}: TooltipAnchorProps): ReactElement {
  return (
    <span className={cn("kit-tooltip-anchor", `is-side-${side}`, `is-align-${align}`, className)} {...props}>
      {children}
      <Tooltip className={cn("kit-tooltip-floating", tooltipClassName)} shortcut={shortcut} aria-hidden="true">
        {label}
      </Tooltip>
    </span>
  );
}
