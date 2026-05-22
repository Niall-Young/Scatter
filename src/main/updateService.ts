import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater, { type ProgressInfo, type UpdateInfo } from "electron-updater";
import type { AppUpdateErrorCode, AppUpdateState, AppUpdateStatus } from "../shared/types";

const { autoUpdater } = electronUpdater;
const UPDATE_STATE_EVENT = "scatter:updates:state-changed";

let handlersRegistered = false;
let installFallbackTimer: NodeJS.Timeout | undefined;
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

  autoUpdater.autoDownload = true;
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
      status: "downloading",
      availableVersion: info.version,
      downloadedVersion: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: 0,
      canCheck: false,
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

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
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

  if (updateState.status === "checking" || updateState.status === "downloading" || updateState.status === "installing") {
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

export function installUpdate(): AppUpdateState {
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
    autoUpdater.quitAndInstall(false, true);
    scheduleInstallFallbackTimer();
  } catch (error) {
    setUpdateError("install-failed", error);
  }

  return updateState;
}

export function registerUpdateIpc(): void {
  registerUpdaterEvents();
  ipcMain.handle("scatter:updates:get-state", () => getUpdateState());
  ipcMain.handle("scatter:updates:check", () => checkForUpdates());
  ipcMain.handle("scatter:updates:install", () => installUpdate());
}

export function startAutomaticUpdateCheck(): void {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void checkForUpdates();
  }, 3000);
}
