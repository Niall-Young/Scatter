import { app, clipboard, dialog, nativeImage } from "electron";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Attachment,
  AttachmentInput,
  OpenProjectResult,
  ScatterDocument,
  ScatterProjectInfo
} from "../shared/types";
import { recordProjectOpened, unlockAchievement } from "./achievementStore";
import { tMain } from "./i18n";
import { getSettings } from "./settingsStore";

const scatterDirName = ".scatter";
const documentFileName = "scatter.json";
const assetsDirName = "assets";
const assetProtocol = "scatter-asset";
const maxRecentProjects = 24;

function now(): string {
  return new Date().toISOString();
}

function appDataPath(fileName: string): string {
  return path.join(app.getPath("userData"), fileName);
}

function scatterPath(projectPath: string): string {
  return path.join(projectPath, scatterDirName);
}

function documentPath(projectPath: string): string {
  return path.join(scatterPath(projectPath), documentFileName);
}

function assetsPath(projectPath: string): string {
  return path.join(scatterPath(projectPath), assetsDirName);
}

function isProjectRootAvailable(projectPath: string): boolean {
  try {
    return statSync(projectPath).isDirectory();
  } catch {
    return false;
  }
}

export function attachmentFileUrl(storedPath: string): string {
  return `${assetProtocol}://asset/${Buffer.from(storedPath, "utf8").toString("base64url")}`;
}

function normalizeAttachment(attachment: Attachment): Attachment {
  return {
    ...attachment,
    fileUrl: attachmentFileUrl(attachment.storedPath)
  };
}

function normalizeDocument(document: ScatterDocument): ScatterDocument {
  return {
    ...document,
    nodes: (document.nodes || []).map((node) => ({
      ...node,
      data: {
        ...node.data,
        attachments: (node.data.attachments || []).map(normalizeAttachment),
        effort: node.data.effort || "xhigh"
      }
    })),
    edges: document.edges || []
  };
}

function projectNameFromPath(projectPath: string): string {
  return path.basename(projectPath) || "Untitled Scatter Project";
}

function defaultDocument(projectPath: string): ScatterDocument {
  return {
    version: 1,
    projectName: projectNameFromPath(projectPath),
    updatedAt: now(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: []
  };
}

async function ensureProject(projectPath: string): Promise<ScatterDocument> {
  await mkdir(scatterPath(projectPath), { recursive: true });
  await mkdir(assetsPath(projectPath), { recursive: true });

  const docPath = documentPath(projectPath);
  if (!existsSync(docPath)) {
    const doc = defaultDocument(projectPath);
    await writeFile(docPath, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }

  const raw = await readFile(docPath, "utf8");
  const parsed = JSON.parse(raw) as ScatterDocument;
  return normalizeDocument({
    ...defaultDocument(projectPath),
    ...parsed,
    projectName: parsed.projectName || projectNameFromPath(projectPath),
    nodes: parsed.nodes || [],
    edges: parsed.edges || []
  });
}

function persistedRecentProject(project: ScatterProjectInfo): ScatterProjectInfo {
  const { missing: _missing, ...persisted } = project;
  return persisted;
}

function withProjectAvailability(project: ScatterProjectInfo): ScatterProjectInfo {
  const persisted = persistedRecentProject(project);
  return isProjectRootAvailable(project.path) ? persisted : { ...persisted, missing: true };
}

function normalizeRecentProjects(value: unknown): ScatterProjectInfo[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const projects: ScatterProjectInfo[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const project = item as Partial<ScatterProjectInfo>;
    if (typeof project.path !== "string" || !project.path) continue;
    if (seen.has(project.path)) continue;
    seen.add(project.path);
    projects.push({
      name: typeof project.name === "string" && project.name ? project.name : projectNameFromPath(project.path),
      path: project.path,
      updatedAt: typeof project.updatedAt === "string" && project.updatedAt ? project.updatedAt : now()
    });
  }
  return projects.slice(0, maxRecentProjects);
}

async function readRecentProjects(): Promise<ScatterProjectInfo[]> {
  const filePath = appDataPath("recent-projects.json");
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeRecentProjects(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeRecentProjects(projects: ScatterProjectInfo[]): Promise<ScatterProjectInfo[]> {
  const next = normalizeRecentProjects(projects.map(persistedRecentProject)).slice(0, maxRecentProjects);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(appDataPath("recent-projects.json"), JSON.stringify(next, null, 2), "utf8");
  return next.map(withProjectAvailability);
}

async function upsertRecentProject(project: ScatterProjectInfo): Promise<void> {
  const current = await readRecentProjects();
  const existingIndex = current.findIndex((item) => item.path === project.path);
  const next =
    existingIndex >= 0
      ? current.map((item, index) => (index === existingIndex ? persistedRecentProject(project) : item))
      : [persistedRecentProject(project), ...current];
  await writeRecentProjects(next);
}

export async function removeRecentProject(projectPath: string): Promise<ScatterProjectInfo[]> {
  const current = await readRecentProjects();
  const removed = current.some((item) => item.path === projectPath);
  const next = current.filter((item) => item.path !== projectPath);
  const projects = await writeRecentProjects(next);
  if (removed) {
    await unlockAchievement("gone-in-a-flash").catch(() => undefined);
  }
  return projects;
}

export async function getRecentProjects(): Promise<ScatterProjectInfo[]> {
  const projects = await readRecentProjects();
  return projects.map(withProjectAvailability);
}

export async function reorderRecentProjects(projectPaths: string[]): Promise<ScatterProjectInfo[]> {
  const current = await readRecentProjects();
  const byPath = new Map(current.map((project) => [project.path, project]));
  const used = new Set<string>();
  const reordered: ScatterProjectInfo[] = [];

  for (const projectPath of projectPaths) {
    const project = byPath.get(projectPath);
    if (!project || used.has(project.path)) continue;
    used.add(project.path);
    reordered.push(project);
  }

  const next = [...reordered, ...current.filter((project) => !used.has(project.path))];
  return writeRecentProjects(next);
}

export async function chooseProject(kind: "create" | "open"): Promise<OpenProjectResult | null> {
  const settings = await getSettings();
  const result = await dialog.showOpenDialog({
    title:
      kind === "create"
        ? tMain(settings.language, "chooseProjectCreateTitle")
        : tMain(settings.language, "chooseProjectOpenTitle"),
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return openKnownProject(result.filePaths[0]);
}

export async function chooseAttachments(projectPath: string): Promise<Attachment[]> {
  const settings = await getSettings();
  const result = await dialog.showOpenDialog({
    title: tMain(settings.language, "chooseAttachmentsTitle"),
    properties: ["openFile", "multiSelections"],
    securityScopedBookmarks: true
  });

  if (result.canceled || result.filePaths.length === 0) return [];
  return saveAttachments(
    projectPath,
    result.filePaths.map((filePath, index) => ({
      name: path.basename(filePath),
      path: filePath,
      bookmark: result.bookmarks?.[index],
      source: "upload"
    }))
  );
}

export async function openKnownProject(projectPath: string): Promise<OpenProjectResult> {
  if (!isProjectRootAvailable(projectPath)) {
    const settings = await getSettings();
    throw new Error(tMain(settings.language, "projectMissingError"));
  }

  const document = await ensureProject(projectPath);
  const project: ScatterProjectInfo = {
    name: document.projectName || projectNameFromPath(projectPath),
    path: projectPath,
    updatedAt: now()
  };
  await upsertRecentProject(project);
  await recordProjectOpened(projectPath).catch(() => undefined);
  return { project, document };
}

export async function saveDocument(projectPath: string, document: ScatterDocument): Promise<ScatterDocument> {
  if (!isProjectRootAvailable(projectPath)) {
    const settings = await getSettings();
    throw new Error(tMain(settings.language, "projectMissingError"));
  }

  const next: ScatterDocument = {
    ...document,
    updatedAt: now(),
    projectName: document.projectName || projectNameFromPath(projectPath)
  };
  await mkdir(scatterPath(projectPath), { recursive: true });
  await writeFile(documentPath(projectPath), JSON.stringify(next, null, 2), "utf8");
  await upsertRecentProject({
    name: next.projectName,
    path: projectPath,
    updatedAt: next.updatedAt
  });
  return next;
}

function sanitizeBaseName(name: string): string {
  return name
    .replace(/[^\w.\- ()\u4e00-\u9fa5]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "attachment";
}

function extensionFor(input: AttachmentInput): string {
  const fromName = path.extname(input.name);
  if (fromName) return fromName;
  if (input.mime?.includes("png")) return ".png";
  if (input.mime?.includes("jpeg") || input.mime?.includes("jpg")) return ".jpg";
  if (input.mime?.includes("webp")) return ".webp";
  if (input.mime?.includes("gif")) return ".gif";
  if (input.mime?.includes("pdf")) return ".pdf";
  if (input.mime?.includes("markdown")) return ".md";
  if (input.mime?.includes("text")) return ".txt";
  return ".bin";
}

function kindFor(input: AttachmentInput): "image" | "file" {
  if (input.mime?.startsWith("image/")) return "image";
  const ext = extensionFor(input).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(ext) ? "image" : "file";
}

async function withSecurityScopedAccess<T>(bookmark: string | undefined, action: () => Promise<T>): Promise<T> {
  let stopAccessing: (() => void) | undefined;
  if (bookmark && process.platform === "darwin" && process.mas) {
    const releaseSecurityScopedAccess = app.startAccessingSecurityScopedResource(bookmark);
    stopAccessing = () => releaseSecurityScopedAccess();
  }

  try {
    return await action();
  } finally {
    stopAccessing?.();
  }
}

async function saveAttachment(projectPath: string, input: AttachmentInput): Promise<Attachment> {
  await mkdir(assetsPath(projectPath), { recursive: true });
  const id = randomUUID();
  const ext = extensionFor(input);
  const base = sanitizeBaseName(path.basename(input.name, path.extname(input.name)));
  const fileName = `${id}-${base}${ext}`;
  const storedPath = path.join(assetsPath(projectPath), fileName);

  if (input.path) {
    const sourcePath = input.path;
    await withSecurityScopedAccess(input.bookmark, () => copyFile(sourcePath, storedPath));
  } else if (input.bytes) {
    await writeFile(storedPath, Buffer.from(input.bytes));
  } else {
    throw new Error("Attachment input must include a file path or bytes.");
  }

  const fileStat = await stat(storedPath);
  const relativePath = path.join(scatterDirName, assetsDirName, fileName);

  return {
    id,
    kind: kindFor(input),
    source: input.source,
    originalName: input.name,
    storedPath,
    relativePath,
    fileUrl: attachmentFileUrl(storedPath),
    mime: input.mime || "application/octet-stream",
    size: fileStat.size,
    createdAt: now()
  };
}

export async function saveAttachments(projectPath: string, inputs: AttachmentInput[]): Promise<Attachment[]> {
  const saved: Attachment[] = [];
  for (const input of inputs) {
    saved.push(await saveAttachment(projectPath, input));
  }
  return saved;
}

export async function saveClipboardImage(projectPath: string): Promise<Attachment | null> {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const png = image.toPNG();
  if (png.length === 0) return null;
  const bytes = new ArrayBuffer(png.byteLength);
  new Uint8Array(bytes).set(png);
  return saveAttachment(projectPath, {
    name: `clipboard-image-${Date.now()}.png`,
    mime: "image/png",
    source: "clipboard",
    bytes
  });
}

export async function getClipboardFilePaths(): Promise<string[]> {
  const candidates = new Set<string>();
  const formats = clipboard.availableFormats();

  for (const format of ["public.file-url", "text/uri-list"]) {
    if (!formats.includes(format)) continue;
    const raw = clipboard.read(format);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("file://")) {
        try {
          candidates.add(decodeURIComponent(new URL(trimmed).pathname));
        } catch {
          // Ignore malformed clipboard URL entries.
        }
      }
    }
  }

  return [...candidates].filter((filePath) => existsSync(filePath));
}

export async function saveClipboardFiles(projectPath: string): Promise<Attachment[]> {
  const paths = await getClipboardFilePaths();
  return saveAttachments(
    projectPath,
    paths.map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
      source: "paste"
    }))
  );
}

export function createEmptyNativeImage(): Electron.NativeImage {
  return nativeImage.createEmpty();
}
