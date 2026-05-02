import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ReactElement } from "react";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked, onCheckedChange, label }: SwitchProps): ReactElement {
  return (
    <label className="switch-row">
      {label ? <span>{label}</span> : null}
      <SwitchPrimitive.Root className="switch-root" checked={checked} onCheckedChange={onCheckedChange}>
        <SwitchPrimitive.Thumb className="switch-thumb" />
      </SwitchPrimitive.Root>
    </label>
  );
}
