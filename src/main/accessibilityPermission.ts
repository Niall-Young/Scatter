import { shell, systemPreferences } from "electron";
import type { AccessibilityPermissionStatus } from "../shared/types";

const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export function getAccessibilityPermissionStatus(): AccessibilityPermissionStatus {
  return {
    trusted: systemPreferences.isTrustedAccessibilityClient(false)
  };
}

export function requestAccessibilityPermission(): AccessibilityPermissionStatus {
  return {
    trusted: systemPreferences.isTrustedAccessibilityClient(true)
  };
}

export async function openAccessibilitySettings(): Promise<void> {
  await shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
}
