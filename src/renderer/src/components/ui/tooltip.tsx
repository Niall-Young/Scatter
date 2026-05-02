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
