export type AttachmentKind = "image" | "file";
export type AttachmentSource = "upload" | "drop" | "paste" | "clipboard";
export type RunMode = "flow" | "node";
export type EffortLevel = "low" | "medium" | "high" | "xhigh";
export type LanguagePreference = "zh" | "en";
export type ThemePreference = "system" | "light" | "dark";

export interface AppSettings {
  themePreference: ThemePreference;
  language: LanguagePreference;
  translucentBackground: boolean;
}

export const defaultAppSettings = {
  themePreference: "system",
  language: "zh",
  translucentBackground: true
} satisfies AppSettings;

export interface ScatterProjectInfo {
  name: string;
  path: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  source: AttachmentSource;
  originalName: string;
  storedPath: string;
  relativePath: string;
  fileUrl: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface AttachmentInput {
  name: string;
  mime?: string;
  source: AttachmentSource;
  path?: string;
  bytes?: ArrayBuffer;
}

export interface ScatterNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  attachments: Attachment[];
  effort: EffortLevel;
  planMode: boolean;
  runMode: RunMode;
  lastRunAt?: string;
}

export interface ScatterNode {
  id: string;
  type: "task";
  position: { x: number; y: number };
  width?: number;
  height?: number;
  selected?: boolean;
  data: ScatterNodeData;
}

export interface ScatterEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ScatterDocument {
  version: 1;
  projectName: string;
  updatedAt: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: ScatterNode[];
  edges: ScatterEdge[];
}

export interface OpenProjectResult {
  project: ScatterProjectInfo;
  document: ScatterDocument;
}

export interface CodexRunInput {
  projectPath: string;
  threadName: string;
  markdown: string;
  imagePaths: string[];
  effort: EffortLevel;
  planMode: boolean;
}

export interface CodexRunResult {
  threadId: string;
  turnId?: string;
  cwd: string;
}
