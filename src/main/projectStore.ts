import { app, clipboard, dialog, nativeImage } from "electron";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Attachment,
  AttachmentInput,
  OpenProjectResult,
  ScatterDocument,
  ScatterProjectInfo
} from "../shared/types";

const scatterDirName = ".scatter";
const documentFileName = "scatter.json";
const assetsDirName = "assets";
const assetProtocol = "scatter-asset";

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

async function addRecentProject(project: ScatterProjectInfo): Promise<void> {
  const current = await getRecentProjects();
  const next = [
    project,
    ...current.filter((item) => item.path !== project.path)
  ].slice(0, 24);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(appDataPath("recent-projects.json"), JSON.stringify(next, null, 2), "utf8");
}

export async function removeRecentProject(projectPath: string): Promise<ScatterProjectInfo[]> {
  const next = (await getRecentProjects()).filter((item) => item.path !== projectPath);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(appDataPath("recent-projects.json"), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function getRecentProjects(): Promise<ScatterProjectInfo[]> {
  const filePath = appDataPath("recent-projects.json");
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ScatterProjectInfo[];
  } catch {
    return [];
  }
}

export async function chooseProject(kind: "create" | "open"): Promise<OpenProjectResult | null> {
  const result = await dialog.showOpenDialog({
    title: kind === "create" ? "Choose or create a Scatter project folder" : "Open a Scatter project folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return openKnownProject(result.filePaths[0]);
}

export async function openKnownProject(projectPath: string): Promise<OpenProjectResult> {
  const document = await ensureProject(projectPath);
  const project: ScatterProjectInfo = {
    name: document.projectName || projectNameFromPath(projectPath),
    path: projectPath,
    updatedAt: now()
  };
  await addRecentProject(project);
  return { project, document };
}

export async function saveDocument(projectPath: string, document: ScatterDocument): Promise<ScatterDocument> {
  const next: ScatterDocument = {
    ...document,
    updatedAt: now(),
    projectName: document.projectName || projectNameFromPath(projectPath)
  };
  await mkdir(scatterPath(projectPath), { recursive: true });
  await writeFile(documentPath(projectPath), JSON.stringify(next, null, 2), "utf8");
  await addRecentProject({
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

async function saveAttachment(projectPath: string, input: AttachmentInput): Promise<Attachment> {
  await mkdir(assetsPath(projectPath), { recursive: true });
  const id = randomUUID();
  const ext = extensionFor(input);
  const base = sanitizeBaseName(path.basename(input.name, path.extname(input.name)));
  const fileName = `${id}-${base}${ext}`;
  const storedPath = path.join(assetsPath(projectPath), fileName);

  if (input.path) {
    await copyFile(input.path, storedPath);
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
