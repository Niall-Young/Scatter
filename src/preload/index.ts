import { contextBridge, ipcRenderer } from "electron";
import type {
  AccessibilityPermissionStatus,
  AchievementState,
  AppSettings,
  AssistantRunInput,
  AssistantRunResult,
  Attachment,
  AttachmentInput,
  OpenProjectResult,
  ScatterDocument,
  ScatterProjectInfo
} from "../shared/types";

const api = {
  getAchievements: (): Promise<AchievementState> => ipcRenderer.invoke("scatter:get-achievements"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("scatter:get-settings"),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("scatter:save-settings", settings),
  accessibility: {
    getStatus: (): Promise<AccessibilityPermissionStatus> => ipcRenderer.invoke("scatter:accessibility:get-status"),
    request: (): Promise<AccessibilityPermissionStatus> => ipcRenderer.invoke("scatter:accessibility:request"),
    openSettings: (): Promise<void> => ipcRenderer.invoke("scatter:accessibility:open-settings")
  },
  getRecentProjects: (): Promise<ScatterProjectInfo[]> => ipcRenderer.invoke("scatter:get-recent-projects"),
  removeRecentProject: (projectPath: string): Promise<ScatterProjectInfo[]> =>
    ipcRenderer.invoke("scatter:remove-recent-project", projectPath),
  createProject: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke("scatter:create-project"),
  openProject: (): Promise<OpenProjectResult | null> => ipcRenderer.invoke("scatter:open-project"),
  openKnownProject: (projectPath: string): Promise<OpenProjectResult> =>
    ipcRenderer.invoke("scatter:open-known-project", projectPath),
  chooseAttachments: (projectPath: string): Promise<Attachment[]> => ipcRenderer.invoke("scatter:choose-attachments", projectPath),
  saveDocument: (projectPath: string, document: ScatterDocument): Promise<ScatterDocument> =>
    ipcRenderer.invoke("scatter:save-document", projectPath, document),
  saveAttachments: (projectPath: string, inputs: AttachmentInput[]): Promise<Attachment[]> =>
    ipcRenderer.invoke("scatter:save-attachments", projectPath, inputs),
  saveClipboardImage: (projectPath: string): Promise<Attachment | null> =>
    ipcRenderer.invoke("scatter:save-clipboard-image", projectPath),
  saveClipboardFiles: (projectPath: string): Promise<Attachment[]> =>
    ipcRenderer.invoke("scatter:save-clipboard-files", projectPath),
  showInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke("scatter:show-in-folder", targetPath),
  runAssistant: (input: AssistantRunInput): Promise<AssistantRunResult> => ipcRenderer.invoke("scatter:run-assistant", input)
};

contextBridge.exposeInMainWorld("scatter", api);

export type ScatterApi = typeof api;
