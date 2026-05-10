import { app, nativeTheme, shell, systemPreferences } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AccessibilityPermissionStatus, LanguagePreference } from "../shared/types";

const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const SCATTER_BUNDLE_ID = "com.scatter.desktop";
const execFileAsync = promisify(execFile);
let guideProcess: ChildProcess | null = null;

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

function accessibilityGuidePath(): string {
  const candidates = [
    path.join(process.cwd(), "build", "accessibility-guide", "ScatterAccessibilityGuide"),
    path.join(process.resourcesPath, "accessibility-guide", "ScatterAccessibilityGuide"),
    path.join(app.getAppPath(), "build", "accessibility-guide", "ScatterAccessibilityGuide")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function currentAppBundlePath(): string {
  let currentPath = app.getPath("exe");

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    if (currentPath.toLowerCase().endsWith(".app")) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return app.getPath("exe");
}

function closeGuideProcess(): void {
  if (!guideProcess || guideProcess.killed) return;
  guideProcess.kill();
  guideProcess = null;
}

export type AccessibilityGuideAppearance = "light" | "dark" | "system";

export async function openAccessibilityPermissionGuide(
  iconPath: string,
  appearance: AccessibilityGuideAppearance,
  language: LanguagePreference
): Promise<AccessibilityPermissionStatus> {
  const status = requestAccessibilityPermission();

  if (process.platform !== "darwin") {
    await openAccessibilitySettings();
    return status;
  }

  if (guideProcess && !guideProcess.killed && guideProcess.exitCode === null) {
    return status;
  }

  const guidePath = accessibilityGuidePath();
  if (!existsSync(guidePath)) {
    throw new Error("Accessibility permission guide helper is missing. Run npm run build:accessibility-guide.");
  }

  const appBundlePath = currentAppBundlePath();
  const appBundleName = path.basename(appBundlePath).replace(/\.app$/i, "") || "Scatter";
  const isDevelopmentMode = !app.isPackaged || appBundleName !== "Scatter";
  guideProcess = spawn(
    guidePath,
    [
      "--app-path",
      appBundlePath,
      "--icon-path",
      iconPath,
      "--app-name",
      appBundleName,
      "--development-mode",
      String(isDevelopmentMode),
      "--appearance",
      appearance === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : appearance,
      "--language",
      language
    ],
    {
      detached: false,
      stdio: "ignore"
    }
  );
  guideProcess.once("exit", () => {
    guideProcess = null;
  });
  guideProcess.once("error", () => {
    guideProcess = null;
  });
  guideProcess.unref();

  return status;
}

export function closeAccessibilityPermissionGuide(): void {
  closeGuideProcess();
}

export async function resetAccessibilityPermission(): Promise<AccessibilityPermissionStatus> {
  closeGuideProcess();

  if (process.platform !== "darwin") {
    return getAccessibilityPermissionStatus();
  }

  try {
    await execFileAsync("/usr/bin/tccutil", ["reset", "Accessibility", SCATTER_BUNDLE_ID]);
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(detail || "Failed to reset Accessibility permission.");
  }

  return getAccessibilityPermissionStatus();
}
