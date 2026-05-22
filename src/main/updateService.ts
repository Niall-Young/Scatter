import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import electronUpdater, { type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from "electron-updater";
import type { AppUpdateErrorCode, AppUpdateState, AppUpdateStatus } from "../shared/types";

const { autoUpdater } = electronUpdater;
const UPDATE_STATE_EVENT = "scatter:updates:state-changed";
const execFileAsync = promisify(execFile);

let handlersRegistered = false;
let installFallbackTimer: NodeJS.Timeout | undefined;
let downloadedUpdateFilePath: string | undefined;
let updateState: AppUpdateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  canCheck: app.isPackaged,
  canInstall: false
};

function canCheckForStatus(status: AppUpdateStatus): boolean {
  return app.isPackaged && status !== "checking" && status !== "downloading" && status !== "installing";
}

function hasInstallableUpdate(): boolean {
  return updateState.canInstall && Boolean(updateState.downloadedVersion);
}

function isInstallingUpdate(): boolean {
  return updateState.status === "installing";
}

function clearInstallFallbackTimer(): void {
  if (!installFallbackTimer) return;
  clearTimeout(installFallbackTimer);
  installFallbackTimer = undefined;
}

function scheduleInstallFallbackTimer(): void {
  clearInstallFallbackTimer();
  installFallbackTimer = setTimeout(() => {
    installFallbackTimer = undefined;
    if (updateState.status !== "installing") return;

    setUpdateError("install-failed", new Error("The update installer did not start. Quit Scatter and reopen it, then try again."));
  }, 45000);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function currentMacAppBundlePath(): string {
  return path.resolve(path.dirname(process.execPath), "../..");
}

function macUpdaterCacheDir(): string {
  return path.join(app.getPath("home"), "Library", "Caches", "scatter-updater");
}

async function downloadedMacUpdateZipPath(): Promise<string> {
  const candidates = [
    downloadedUpdateFilePath,
    updateState.downloadedVersion
      ? path.join(macUpdaterCacheDir(), "pending", `Scatter-${updateState.downloadedVersion}-universal-mac.zip`)
      : undefined,
    path.join(macUpdaterCacheDir(), "update.zip")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error("Downloaded update file is missing.");
}

async function findScatterApp(rootPath: string): Promise<string> {
  const directPath = path.join(rootPath, "Scatter.app");
  if (await pathExists(directPath)) return directPath;

  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const childPath = path.join(rootPath, entry.name);
    if (entry.name === "Scatter.app") return childPath;
    if (entry.name.endsWith(".app")) continue;

    const nestedPath = path.join(childPath, "Scatter.app");
    if (await pathExists(nestedPath)) return nestedPath;
  }

  throw new Error("Downloaded update does not contain Scatter.app.");
}

async function readPlistValue(plistPath: string, key: string): Promise<string> {
  const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath]);
  return stdout.trim();
}

async function validateMacReplacementApp(replacementAppPath: string): Promise<void> {
  const plistPath = path.join(replacementAppPath, "Contents", "Info.plist");
  const bundleIdentifier = await readPlistValue(plistPath, "CFBundleIdentifier");
  if (bundleIdentifier !== "com.scatter.desktop") {
    throw new Error(`Unexpected update bundle identifier: ${bundleIdentifier}`);
  }

  if (updateState.downloadedVersion) {
    const bundleVersion = await readPlistValue(plistPath, "CFBundleShortVersionString");
    if (bundleVersion !== updateState.downloadedVersion) {
      throw new Error(`Unexpected update version: ${bundleVersion}`);
    }
  }

  await execFileAsync("/usr/bin/codesign", ["--verify", "--deep", "--strict", replacementAppPath]);
}

async function installMacUpdateFromZip(): Promise<void> {
  const updateZipPath = await downloadedMacUpdateZipPath();
  const currentAppPath = currentMacAppBundlePath();
  const tempRootPath = await mkdtemp(path.join(os.tmpdir(), "scatter-update-"));
  const extractedPath = path.join(tempRootPath, "extracted");
  await mkdir(extractedPath, { recursive: true });
  await execFileAsync("/usr/bin/ditto", ["-x", "-k", updateZipPath, extractedPath]);

  const replacementAppPath = await findScatterApp(extractedPath);
  await validateMacReplacementApp(replacementAppPath);

  const installScriptPath = path.join(tempRootPath, "install-update.sh");
  const backupPath = path.join(path.dirname(currentAppPath), `.Scatter.app.previous-${Date.now()}`);
  const logPath = path.join(app.getPath("userData"), "update-install.log");
  const installScript = `#!/bin/bash
set -u
pid="$1"
current="$2"
replacement="$3"
backup="$4"
log="$5"
temp_root="$(cd "$(dirname "$0")" && pwd)"
exec >>"$log" 2>&1
echo "[$(/bin/date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting Scatter update install"

for i in $(/usr/bin/seq 1 160); do
  if ! /bin/kill -0 "$pid" 2>/dev/null; then
    break
  fi
  /bin/sleep 0.25
done

if /bin/kill -0 "$pid" 2>/dev/null; then
  echo "Scatter did not quit in time; terminating pid $pid"
  /bin/kill "$pid" 2>/dev/null || true
  /bin/sleep 1
fi

if [ ! -d "$replacement" ]; then
  echo "Replacement app missing: $replacement"
  exit 1
fi

/bin/rm -rf "$backup"
if [ -d "$current" ]; then
  if ! /bin/mv "$current" "$backup"; then
    echo "Failed to move current app to backup: $backup"
    exit 1
  fi
fi

if /usr/bin/ditto "$replacement" "$current"; then
  /usr/bin/xattr -dr com.apple.quarantine "$current" 2>/dev/null || true
  /usr/bin/open "$current"
  /bin/rm -rf "$backup" "$temp_root" 2>/dev/null || true
  echo "Scatter update install finished"
  exit 0
fi

status=$?
echo "Failed to copy replacement app, restoring backup"
/bin/rm -rf "$current"
if [ -d "$backup" ]; then
  /bin/mv "$backup" "$current"
  /usr/bin/open "$current"
fi
exit "$status"
`;

  await writeFile(installScriptPath, installScript, "utf8");
  await chmod(installScriptPath, 0o755);

  const child = spawn("/bin/bash", [installScriptPath, String(process.pid), currentAppPath, replacementAppPath, backupPath, logPath], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  setImmediate(() => app.quit());
}

function setUpdateState(next: Partial<AppUpdateState>): AppUpdateState {
  const status = next.status ?? updateState.status;
  updateState = {
    ...updateState,
    ...next,
    status,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    canCheck: next.canCheck ?? canCheckForStatus(status),
    canInstall: next.canInstall ?? status === "downloaded"
  };
  broadcastUpdateState();
  return updateState;
}

function setUpdateError(errorCode: AppUpdateErrorCode, error: unknown): AppUpdateState {
  const errorMessage = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  clearInstallFallbackTimer();

  return setUpdateState({
    status: "error",
    errorCode,
    errorMessage,
    progressPercent: undefined,
    canCheck: app.isPackaged,
    canInstall: Boolean(updateState.downloadedVersion)
  });
}

function broadcastUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(UPDATE_STATE_EVENT, updateState);
    }
  }
}

function registerUpdaterEvents(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = process.platform !== "darwin";
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    if (hasInstallableUpdate() || isInstallingUpdate()) return;

    setUpdateState({
      status: "checking",
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: undefined,
      canCheck: false,
      canInstall: false
    });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    if (hasInstallableUpdate() || isInstallingUpdate()) return;

    setUpdateState({
      status: "available",
      availableVersion: info.version,
      downloadedVersion: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: undefined,
      canCheck: true,
      canInstall: false
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    if (hasInstallableUpdate() || isInstallingUpdate()) return;

    setUpdateState({
      status: "downloading",
      progressPercent: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : undefined,
      canCheck: false,
      canInstall: false
    });
  });

  autoUpdater.on("update-not-available", () => {
    if (hasInstallableUpdate() || isInstallingUpdate()) return;

    setUpdateState({
      status: "not-available",
      availableVersion: undefined,
      downloadedVersion: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: undefined,
      canCheck: true,
      canInstall: false
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
    downloadedUpdateFilePath = info.downloadedFile;
    setUpdateState({
      status: "downloaded",
      availableVersion: info.version,
      downloadedVersion: info.version,
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: 100,
      canCheck: true,
      canInstall: true
    });
  });

  autoUpdater.on("error", (error: Error) => {
    setUpdateError("check-failed", error);
  });
}

export function getUpdateState(): AppUpdateState {
  return updateState;
}

export async function checkForUpdates(): Promise<AppUpdateState> {
  registerUpdaterEvents();

  if (!app.isPackaged) {
    return setUpdateState({
      status: "error",
      errorCode: "development-mode",
      errorMessage: undefined,
      progressPercent: undefined,
      canCheck: true,
      canInstall: false
    });
  }

  if (updateState.status === "checking" || updateState.status === "available" || updateState.status === "downloading" || updateState.status === "installing") {
    return updateState;
  }

  if (updateState.status === "downloaded") {
    return updateState;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateError("check-failed", error);
  }

  return updateState;
}

export async function downloadUpdate(): Promise<AppUpdateState> {
  registerUpdaterEvents();

  if (!app.isPackaged) {
    return setUpdateState({
      status: "error",
      errorCode: "development-mode",
      errorMessage: undefined,
      progressPercent: undefined,
      canCheck: true,
      canInstall: false
    });
  }

  if (updateState.status === "downloading" || updateState.status === "installing" || updateState.status === "downloaded") {
    return updateState;
  }

  if (updateState.status !== "available" || !updateState.availableVersion) {
    return setUpdateError("check-failed", new Error("No update is available to download."));
  }

  setUpdateState({
    status: "downloading",
    errorCode: undefined,
    errorMessage: undefined,
    progressPercent: 0,
    canCheck: false,
    canInstall: false
  });

  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setUpdateError("check-failed", error);
  }

  return updateState;
}

export async function installUpdate(): Promise<AppUpdateState> {
  registerUpdaterEvents();

  if (updateState.status === "installing") {
    return updateState;
  }

  if (!updateState.canInstall || !updateState.downloadedVersion) {
    return setUpdateError("install-failed", new Error("No downloaded update is ready to install."));
  }

  setUpdateState({
    status: "installing",
    errorCode: undefined,
    errorMessage: undefined,
    progressPercent: 100,
    canCheck: false,
    canInstall: false
  });

  try {
    if (process.platform === "darwin") {
      await installMacUpdateFromZip();
    } else {
      autoUpdater.quitAndInstall(false, true);
      scheduleInstallFallbackTimer();
    }
  } catch (error) {
    setUpdateError("install-failed", error);
  }

  return updateState;
}

export function registerUpdateIpc(): void {
  registerUpdaterEvents();
  ipcMain.handle("scatter:updates:get-state", () => getUpdateState());
  ipcMain.handle("scatter:updates:check", () => checkForUpdates());
  ipcMain.handle("scatter:updates:download", () => downloadUpdate());
  ipcMain.handle("scatter:updates:install", () => installUpdate());
}

export function startAutomaticUpdateCheck(): void {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void checkForUpdates();
  }, 3000);
}
