import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  chooseProject,
  getRecentProjects,
  openKnownProject,
  saveAttachments,
  saveClipboardFiles,
  saveClipboardImage,
  saveDocument
} from "./projectStore";
import { runInCodex } from "./codexBridge";
import type { AttachmentInput, CodexRunInput, ScatterDocument } from "../shared/types";

const SPLASH_MIN_DURATION_MS = 5000;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "scatter-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

function isScatterAssetPath(filePath: string): boolean {
  return filePath.includes(`${path.sep}.scatter${path.sep}assets${path.sep}`);
}

function registerAssetProtocol(): void {
  protocol.handle("scatter-asset", (request) => {
    const url = new URL(request.url);
    const token = url.pathname.slice(1);
    const filePath = Buffer.from(token, "base64url").toString("utf8");

    if (!isScatterAssetPath(filePath)) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function rendererUrl(query?: Record<string, string>): string | null {
  if (!process.env.ELECTRON_RENDERER_URL) return null;

  const url = new URL(process.env.ELECTRON_RENDERER_URL);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function loadRenderer(window: BrowserWindow, query?: Record<string, string>): void {
  const devUrl = rendererUrl(query);
  if (devUrl) {
    void window.loadURL(devUrl);
    return;
  }

  void window.loadFile(path.join(__dirname, "../renderer/index.html"), query ? { query } : undefined);
}

function createSplashWindow(): BrowserWindow {
  const splashWindow = new BrowserWindow({
    width: 936,
    height: 528,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: "fullscreen-ui",
    visualEffectState: "active",
    title: "Scatter",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  splashWindow.once("ready-to-show", () => {
    if (!splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  loadRenderer(splashWindow, { window: "splash" });
  return splashWindow;
}

function createWindow(showWhenReady = false): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    minWidth: 1040,
    minHeight: 720,
    title: "Scatter",
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: "fullscreen-ui",
    visualEffectState: "active",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (showWhenReady) {
    mainWindow.once("ready-to-show", () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    });
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const isMacDevtoolsShortcut = process.platform === "darwin" && input.meta && input.alt && input.key.toLowerCase() === "i";
    const isWindowsDevtoolsShortcut =
      process.platform !== "darwin" && input.control && input.shift && input.key.toLowerCase() === "i";
    const isF12 = input.key === "F12";

    if (!isMacDevtoolsShortcut && !isWindowsDevtoolsShortcut && !isF12) return;

    event.preventDefault();
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  loadRenderer(mainWindow);
  return mainWindow;
}

app.whenReady().then(() => {
  registerAssetProtocol();
  ipcMain.handle("scatter:get-recent-projects", () => getRecentProjects());
  ipcMain.handle("scatter:create-project", () => chooseProject("create"));
  ipcMain.handle("scatter:open-project", () => chooseProject("open"));
  ipcMain.handle("scatter:open-known-project", (_event, projectPath: string) => openKnownProject(projectPath));
  ipcMain.handle("scatter:save-document", (_event, projectPath: string, document: ScatterDocument) =>
    saveDocument(projectPath, document)
  );
  ipcMain.handle("scatter:save-attachments", (_event, projectPath: string, inputs: AttachmentInput[]) =>
    saveAttachments(projectPath, inputs)
  );
  ipcMain.handle("scatter:save-clipboard-image", (_event, projectPath: string) => saveClipboardImage(projectPath));
  ipcMain.handle("scatter:save-clipboard-files", (_event, projectPath: string) => saveClipboardFiles(projectPath));
  ipcMain.handle("scatter:show-in-folder", (_event, targetPath: string) => shell.showItemInFolder(targetPath));
  ipcMain.handle("scatter:run-codex", (_event, input: CodexRunInput) => runInCodex(input));

  const splashWindow = createSplashWindow();
  const mainWindow = createWindow();
  const splashDelay = new Promise((resolve) => {
    setTimeout(resolve, SPLASH_MIN_DURATION_MS);
  });
  const mainWindowReady = new Promise<void>((resolve) => {
    mainWindow.once("ready-to-show", () => resolve());
  });

  Promise.all([splashDelay, mainWindowReady]).then(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(true);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
