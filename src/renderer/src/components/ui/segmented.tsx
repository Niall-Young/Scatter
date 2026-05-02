import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

export function Segmented({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn("kit-segmented", className)} role="tablist" {...props} />;
}

interface SegmentedItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  selected?: boolean;
}

export function SegmentedItem({ className, icon = "marker-code", selected = false, type = "button", ...props }: SegmentedItemProps): ReactElement {
  return (
    <button aria-selected={selected} className={cn("kit-segmented-item", selected && "is-selected", className)} role="tab" type={type} {...props}>
      <Icon name={icon} size={16} />
    </button>
  );
}
