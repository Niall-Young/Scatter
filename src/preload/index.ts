import { contextBridge, ipcRenderer } from "electron";
import type {
  Attachment,
  AttachmentInput,
  CodexRunInput,
  CodexRunResult,
  OpenProjectResult,
  ScatterDocument,
  ScatterProjectInfo
} from "../shared/types";

const api = {
  getRecentProjects: (): Promise<ScatterProjectInfo[]> => ipcRenderer.invoke("scatter:get-recent-projects"),
  createProject: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke("scatter:create-project"),
  openProject: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke("scatter:open-project"),
  openKnownProject: (projectPath: string): Promise<OpenProjectResult> =>
    ipcRenderer.invoke("scatter:open-known-project", projectPath),
  saveDocument: (projectPath: string, document: ScatterDocument): Promise<ScatterDocument> =>
    ipcRenderer.invoke("scatter:save-document", projectPath, document),
  saveAttachments: (projectPath: string, inputs: AttachmentInput[]): Promise<Attachment[]> =>
    ipcRenderer.invoke("scatter:save-attachments", projectPath, inputs),
  saveClipboardImage: (projectPath: string): Promise<Attachment | null> =>
    ipcRenderer.invoke("scatter:save-clipboard-image", projectPath),
  saveClipboardFiles: (projectPath: string): Promise<Attachment[]> =>
    ipcRenderer.invoke("scatter:save-clipboard-files", projectPath),
  showInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke("scatter:show-in-folder", targetPath),
  runCodex: (input: CodexRunInput): Promise<CodexRunResult> => ipcRenderer.invoke("scatter:run-codex", input)
};

contextBridge.exposeInMainWorld("scatter", api);

export type ScatterApi = typeof api;
