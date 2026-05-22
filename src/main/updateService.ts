import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater, { type ProgressInfo, type UpdateInfo } from "electron-updater";
import type { AppUpdateErrorCode, AppUpdateState, AppUpdateStatus } from "../shared/types";

const { autoUpdater } = electronUpdater;
const UPDATE_STATE_EVENT = "scatter:updates:state-changed";

let handlersRegistered = false;
let updateState: AppUpdateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  canCheck: app.isPackaged,
  canInstall: false
};

function canCheckForStatus(status: AppUpdateStatus): boolean {
  return app.isPackaged && status !== "checking" && status !== "downloading";
}

function hasInstallableUpdate(): boolean {
  return updateState.canInstall && Boolean(updateState.downloadedVersion);
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
  if (hasInstallableUpdate()) {
    return setUpdateState({
      status: "downloaded",
      errorCode: undefined,
      errorMessage: undefined,
      progressPercent: 100,
      canCheck: true,
      canInstall: true
    });
  }

  return setUpdateState({
    status: "error",
    errorCode,
    errorMessage,
    progressPercent: undefined,
    canCheck: app.isPackaged,
    canInstall: updateState.status === "downloaded"
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
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    if (hasInstallableUpdate()) return;

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
    if (hasInstallableUpdate()) return;

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
    if (hasInstallableUpdate()) return;

    setUpdateState({
      status: "downloading",
      progressPercent: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : undefined,
      canCheck: false,
      canInstall: false
    });
  });

  autoUpdater.on("update-not-available", () => {
    if (hasInstallableUpdate()) return;

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

  if (updateState.status === "checking" || updateState.status === "downloading") {
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

  if (!updateState.canInstall || !updateState.downloadedVersion) {
    return setUpdateError("install-failed", new Error("No downloaded update is ready to install."));
  }

  autoUpdater.quitAndInstall(false, true);
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
