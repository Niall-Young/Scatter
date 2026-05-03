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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    title: "Scatter",
    backgroundColor: "#f2f2f2",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
