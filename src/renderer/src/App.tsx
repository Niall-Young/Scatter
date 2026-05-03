import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  addEdge,
  Background,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnSelectionChangeParams,
  type OnNodeDrag,
  type ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  type EdgeTypes,
  type NodeTypes
} from "@xyflow/react";
import { nanoid } from "nanoid";
import type {
  Attachment,
  AttachmentInput,
  LanguagePreference,
  OpenProjectResult,
  RunMode,
  ScatterDocument,
  ScatterEdge,
  ScatterNode,
  ScatterNodeData,
  ScatterProjectInfo,
  ThemePreference
} from "../../shared/types";
import { defaultAppSettings } from "../../shared/types";
import { buildMarkdown } from "./lib/markdown";
import { I18nProvider } from "./lib/i18n";
import { shortcuts } from "./lib/shortcuts";
import { createTranslator } from "./lib/translations";
import { Sidebar } from "./components/Sidebar";
import { ScatterEdge as ScatterFlowEdge } from "./components/ScatterEdge";
import { SearchDialog } from "./components/SearchDialog";
import { SettingsDialog, type SettingsValues } from "./components/SettingsDialog";
import { Topbar } from "./components/Topbar";
import { RightDrawer } from "./components/RightDrawer";
import { TaskNode, setTaskNodeActions } from "./components/TaskNode";
import { DropdownMenu, DropdownMenuItem } from "./components/ui/dropdown-menu";
import { Icon } from "./components/ui/icon";
import { IconButton } from "./components/ui/icon-button";
import { TooltipAnchor } from "./components/ui/tooltip";
import { useScatterStore } from "./store/scatterStore";
import startupBulbImage from "./assets/startup-bulb.jpg";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";

const nodeTypes = { task: TaskNode } satisfies NodeTypes;
const edgeTypes = { scatter: ScatterFlowEdge } satisfies EdgeTypes;
const TASK_NODE_WIDTH = 400;
const TASK_NODE_HEIGHT = 220;
const TASK_NODE_HORIZONTAL_GAP = 180;
const TASK_NODE_VERTICAL_GAP = 72;
const MARKDOWN_PANEL_DEFAULT_RATIO = 0.5;
const MARKDOWN_PANEL_MIN_WIDTH = 360;
const zoomOptions = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 }
];

type FlowPosition = { x: number; y: number };
type CanvasTool = "select" | "pan";
interface OptionDuplicateDrag {
  sourceId: string;
  duplicateId: string;
  originalNodes: ScatterNode[];
  lastPosition: FlowPosition;
  hasPreview: boolean;
}

function systemColorTheme(): "light" | "dark" {
  if (!window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function roundPosition(position: FlowPosition): FlowPosition {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}

function nodeBounds(node: ScatterNode): { width: number; height: number } {
  return {
    width: node.width ?? TASK_NODE_WIDTH,
    height: node.height ?? TASK_NODE_HEIGHT
  };
}

function positionOverlapsNode(position: FlowPosition, node: ScatterNode): boolean {
  const margin = 32;
  const bounds = nodeBounds(node);
  const left = position.x;
  const right = position.x + TASK_NODE_WIDTH;
  const top = position.y;
  const bottom = position.y + TASK_NODE_HEIGHT;
  const nodeLeft = node.position.x - margin;
  const nodeRight = node.position.x + bounds.width + margin;
  const nodeTop = node.position.y - margin;
  const nodeBottom = node.position.y + bounds.height + margin;

  return left < nodeRight && right > nodeLeft && top < nodeBottom && bottom > nodeTop;
}

function isOpenPosition(position: FlowPosition, nodes: ScatterNode[]): boolean {
  return nodes.every((node) => !positionOverlapsNode(position, node));
}

function findOpenPositionNear(preferred: FlowPosition, nodes: ScatterNode[]): FlowPosition {
  const base = roundPosition(preferred);
  if (isOpenPosition(base, nodes)) return base;

  const stepX = TASK_NODE_WIDTH + TASK_NODE_HORIZONTAL_GAP;
  const stepY = TASK_NODE_HEIGHT + TASK_NODE_VERTICAL_GAP;
  for (let ring = 1; ring <= 6; ring += 1) {
    for (let column = -ring; column <= ring; column += 1) {
      for (let row = -ring; row <= ring; row += 1) {
        if (Math.abs(column) !== ring && Math.abs(row) !== ring) continue;
        const candidate = roundPosition({
          x: preferred.x + column * stepX,
          y: preferred.y + row * stepY
        });
        if (isOpenPosition(candidate, nodes)) return candidate;
      }
    }
  }

  return base;
}

function findOpenPositionToRight(preferred: FlowPosition, nodes: ScatterNode[]): FlowPosition {
  const base = roundPosition(preferred);
  if (isOpenPosition(base, nodes)) return base;

  const stepX = TASK_NODE_WIDTH + TASK_NODE_HORIZONTAL_GAP;
  const stepY = TASK_NODE_HEIGHT + TASK_NODE_VERTICAL_GAP;
  const rowOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (let column = 0; column <= 4; column += 1) {
    for (const row of rowOffsets) {
      const candidate = roundPosition({
        x: preferred.x + column * stepX,
        y: preferred.y + row * stepY
      });
      if (isOpenPosition(candidate, nodes)) return candidate;
    }
  }

  return base;
}

function defaultTaskTitle(nodes: ScatterNode[], t: ReturnType<typeof createTranslator>): string {
  const nextNumber =
    nodes.reduce((max, node) => {
      const match = /^(?:新建任务|New task)\s+(\d+)$/.exec(node.data.title.trim());
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return t("task.defaultTitle", { count: nextNumber });
}

function emptyNode(position: { x: number; y: number }, existingNodes: ScatterNode[], t: ReturnType<typeof createTranslator>): ScatterNode {
  return {
    id: nanoid(),
    type: "task",
    position,
    data: {
      title: defaultTaskTitle(existingNodes, t),
      body: "",
      attachments: [],
      effort: "xhigh",
      planMode: false,
      runMode: "flow"
    }
  };
}

function cloneCanvasNode(node: ScatterNode): ScatterNode {
  return {
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      attachments: node.data.attachments.map((attachment) => ({ ...attachment }))
    }
  };
}

function duplicateNodeAt(source: ScatterNode, position: FlowPosition, id = nanoid()): ScatterNode {
  return {
    ...cloneCanvasNode(source),
    id,
    selected: true,
    position: roundPosition(position)
  };
}

function optionDuplicatePreviewNodes(drag: OptionDuplicateDrag, position: FlowPosition): ScatterNode[] {
  const source = drag.originalNodes.find((node) => node.id === drag.sourceId);
  if (!source) return drag.originalNodes.map(cloneCanvasNode);

  const restoredNodes = drag.originalNodes.map((node) => ({
    ...cloneCanvasNode(node),
    selected: false
  }));
  return [...restoredNodes, duplicateNodeAt(source, position, drag.duplicateId)];
}

function toDocument(projectName: string, nodes: ScatterNode[], edges: ScatterEdge[]): ScatterDocument {
  return {
    version: 1,
    projectName,
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges
  };
}

async function filesToInputs(files: FileList | File[], source: "upload" | "drop" | "paste"): Promise<AttachmentInput[]> {
  const inputs: AttachmentInput[] = [];
  for (const file of Array.from(files)) {
    const maybePath = (file as File & { path?: string }).path;
    if (maybePath) {
      inputs.push({
        name: file.name,
        mime: file.type,
        source,
        path: maybePath
      });
      continue;
    }

    const bytes = await file.arrayBuffer();
    inputs.push({
      name: file.name || `pasted-${Date.now()}`,
      mime: file.type,
      source,
      bytes
    });
  }
  return inputs;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function App(): ReactElement {
  const {
    project,
    nodes,
    edges,
    selectedNodeId,
    drawer,
    theme,
    canUndo,
    canRedo,
    setProjectDocument,
    clearProject,
    replaceCanvasLive,
    commitCanvasChange,
    beginHistoryTransaction,
    commitHistoryTransaction,
    cancelHistoryTransaction,
    undo,
    redo,
    updateNodeData,
    appendAttachments,
    setSelectedNodeId,
    setDrawer,
    setTheme,
    setStatus,
    setSaving,
    removeAttachment,
    markNodeRun
  } = useScatterStore();

  const [recentProjects, setRecentProjects] = useState<ScatterProjectInfo[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(defaultAppSettings.themePreference);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => systemColorTheme());
  const [language, setLanguage] = useState<LanguagePreference>(defaultAppSettings.language);
  const [translucentBackground, setTranslucentBackground] = useState<boolean>(defaultAppSettings.translucentBackground);
  const [markdownPanelRatio, setMarkdownPanelRatio] = useState(MARKDOWN_PANEL_DEFAULT_RATIO);
  const [isResizingMarkdownPanel, setIsResizingMarkdownPanel] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [canvasRevealActive, setCanvasRevealActive] = useState(false);
  const isSplashWindow = new URLSearchParams(window.location.search).get("window") === "splash";
  const saveTimerRef = useRef<number | null>(null);
  const loadedProjectPathRef = useRef<string | null>(null);
  const latestMouseRef = useRef({ x: 360, y: 240 });
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement | null>(null);
  const nodeDragActiveRef = useRef(false);
  const nodeDragHistoryOpenRef = useRef(false);
  const optionDuplicateDragRef = useRef<OptionDuplicateDrag | null>(null);
  const optionDuplicateSettledSourceRef = useRef<string | null>(null);
  const settingsSnapshotRef = useRef<SettingsValues | null>(null);
  const settingsSaveRequestedRef = useRef(false);
  const [taskRunModeOverride, setTaskRunModeOverride] = useState<{ nodeId: string; mode: RunMode } | null>(null);
  const t = useMemo(() => createTranslator(language), [language]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedRunModeOverride = taskRunModeOverride && taskRunModeOverride.nodeId === selectedNode?.id ? taskRunModeOverride.mode : null;
  const selectedRunMode = selectedRunModeOverride ?? selectedNode?.data.runMode ?? "flow";
  const panModeActive = canvasTool === "pan" || spacePanActive;
  const zoomPercent = Math.round(viewportZoom * 100);
  const markdownResult = useMemo(
    () =>
      project
        ? buildMarkdown(nodes, edges, selectedNodeId, selectedRunMode, project.name, project.path, language)
        : {
            markdown: "",
            nodes: [],
            attachments: [],
            imagePaths: [],
            planMode: false,
            hasCycle: false
          },
    [edges, language, nodes, project, selectedNodeId, selectedRunMode]
  );

  useEffect(() => {
    if (!canvasRevealActive) return;
    const timer = window.setTimeout(() => setCanvasRevealActive(false), 520);
    return () => window.clearTimeout(timer);
  }, [canvasRevealActive]);

  const refreshRecentProjects = useCallback(async () => {
    setRecentProjects(await window.scatter.getRecentProjects());
  }, []);

  const removeRecentProject = useCallback(
    async (projectPath: string) => {
      const removesCurrentProject = project?.path === projectPath;
      if (removesCurrentProject && saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (removesCurrentProject) {
        loadedProjectPathRef.current = null;
      }

      try {
        setRecentProjects(await window.scatter.removeRecentProject(projectPath));
        if (removesCurrentProject) {
          clearProject();
          setCanvasRevealActive(false);
        }
        setStatus(t("status.removedRecent"));
      } catch (error) {
        if (removesCurrentProject && useScatterStore.getState().project?.path === projectPath) {
          loadedProjectPathRef.current = projectPath;
        }
        setStatus(error instanceof Error ? error.message : t("status.removeRecentFailed"));
      }
    },
    [clearProject, project?.path, setStatus, t]
  );

  const applySettingsValues = useCallback((values: SettingsValues): void => {
    setThemePreference(values.themePreference);
    setLanguage(values.language);
    setTranslucentBackground(values.translucentBackground);
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.scatter
      .getSettings()
      .then((settings) => {
        if (!cancelled) applySettingsValues(settings);
      })
      .catch(() => {
        if (!cancelled) applySettingsValues(defaultAppSettings);
      });

    return () => {
      cancelled = true;
    };
  }, [applySettingsValues]);

  const openSettingsDialog = useCallback((): void => {
    settingsSaveRequestedRef.current = false;
    settingsSnapshotRef.current = {
      themePreference,
      language,
      translucentBackground
    };
    setSettingsOpen(true);
  }, [language, themePreference, translucentBackground]);

  const handleSettingsOpenChange = useCallback(
    (open: boolean): void => {
      if (open) {
        openSettingsDialog();
        return;
      }

      setSettingsOpen(false);
      if (settingsSaveRequestedRef.current) {
        settingsSaveRequestedRef.current = false;
        settingsSnapshotRef.current = null;
        return;
      }

      const snapshot = settingsSnapshotRef.current;
      if (snapshot) {
        applySettingsValues(snapshot);
      }
      settingsSnapshotRef.current = null;
    },
    [applySettingsValues, openSettingsDialog]
  );

  const handleSaveSettings = useCallback(
    async (values: SettingsValues): Promise<void> => {
      try {
        const savedSettings = await window.scatter.saveSettings(values);
        settingsSaveRequestedRef.current = true;
        settingsSnapshotRef.current = null;
        applySettingsValues(savedSettings);
        setStatus(createTranslator(savedSettings.language)("settings.saved"));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("settings.saveFailed");
        setStatus(message);
        throw new Error(message);
      }
    },
    [applySettingsValues, setStatus, t]
  );

  useEffect(() => {
    if (!isSplashWindow) {
      void refreshRecentProjects();
    }
  }, [isSplashWindow, refreshRecentProjects]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (): void => {
      setSystemTheme(media.matches ? "dark" : "light");
    };

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;
    if (theme !== resolvedTheme) {
      setTheme(resolvedTheme);
    }
  }, [setTheme, systemTheme, theme, themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.window = isSplashWindow ? "splash" : "main";
    document.documentElement.dataset.translucent = translucentBackground ? "true" : "false";
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [isSplashWindow, language, theme, translucentBackground]);

  useEffect(() => {
    function isSpaceKey(event: KeyboardEvent): boolean {
      return event.code === "Space" || event.key === " ";
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (settingsOpen || searchOpen || !isSpaceKey(event) || isEditableTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSpacePanActive(true);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (!isSpaceKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSpacePanActive(false);
    }

    function handleBlur(): void {
      setSpacePanActive(false);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleBlur);
    };
  }, [searchOpen, settingsOpen]);

  const hydrateProject = useCallback(
    async (result: OpenProjectResult | null) => {
      if (!result) return;
      const shouldRevealCanvas = useScatterStore.getState().project === null;
      loadedProjectPathRef.current = result.project.path;
      setCanvasRevealActive(shouldRevealCanvas);
      setProjectDocument(result.project, result.document);
      setStatus(t("app.openedProject", { name: result.project.name }));
      await refreshRecentProjects();
    },
    [refreshRecentProjects, setProjectDocument, setStatus, t]
  );

  const createProject = useCallback(() => {
    void window.scatter.createProject().then(hydrateProject);
  }, [hydrateProject]);

  const saveDocumentSnapshot = useCallback(async (targetProject: ScatterProjectInfo, document: ScatterDocument) => {
    if (loadedProjectPathRef.current !== targetProject.path) return;
    if (useScatterStore.getState().project?.path !== targetProject.path) return;

    setSaving(true);
    try {
      await window.scatter.saveDocument(targetProject.path, document);
      setStatus(t("status.saved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("status.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [setSaving, setStatus, t]);

  useEffect(() => {
    if (!project || loadedProjectPathRef.current !== project.path) return;
    if (nodeDragActiveRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const document = toDocument(project.name, nodes, edges);
    const targetProject = project;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveDocumentSnapshot(targetProject, document);
    }, 550);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, project, saveDocumentSnapshot]);

  const getVisibleCanvasCenterPosition = useCallback((): FlowPosition => {
    const canvasRect = canvasShellRef.current?.getBoundingClientRect();
    const screenCenter = canvasRect
      ? {
          x: canvasRect.left + canvasRect.width / 2,
          y: canvasRect.top + canvasRect.height / 2
        }
      : latestMouseRef.current;
    const flowCenter = flowInstanceRef.current?.screenToFlowPosition(screenCenter) ?? screenCenter;

    return {
      x: flowCenter.x - TASK_NODE_WIDTH / 2,
      y: flowCenter.y - TASK_NODE_HEIGHT / 2
    };
  }, []);

  const addNode = useCallback(() => {
    if (!project) return;
    const position = selectedNode
      ? findOpenPositionToRight(
          {
            x: selectedNode.position.x + nodeBounds(selectedNode).width + TASK_NODE_HORIZONTAL_GAP,
            y: selectedNode.position.y
          },
          nodes
        )
      : findOpenPositionNear(getVisibleCanvasCenterPosition(), nodes);
    const node = emptyNode(position, nodes, t);
    commitCanvasChange({ nodes: [...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }] });
    setSelectedNodeId(node.id);
  }, [commitCanvasChange, getVisibleCanvasCenterPosition, nodes, project, selectedNode, setSelectedNodeId, t]);

  const addFilesToNode = useCallback(
    async (nodeId: string, files: FileList | File[], source: "upload" | "drop" | "paste") => {
      if (!project) return;
      const inputs = await filesToInputs(files, source);
      if (!inputs.length) return;
      const saved = await window.scatter.saveAttachments(project.path, inputs);
      appendAttachments(nodeId, saved);
      setStatus(t("status.attachmentsAdded", { count: saved.length }));
    },
    [appendAttachments, project, setStatus, t]
  );

  const ensureTargetNode = useCallback((): ScatterNode | null => {
    if (!project) return null;
    const existing = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
    if (existing) return existing;
    const node = emptyNode(findOpenPositionNear(getVisibleCanvasCenterPosition(), nodes), nodes, t);
    replaceCanvasLive({ nodes: [...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }] });
    setSelectedNodeId(node.id);
    return node;
  }, [getVisibleCanvasCenterPosition, nodes, project, replaceCanvasLive, selectedNodeId, setSelectedNodeId, t]);

  const runNode = useCallback(
    async (nodeId: string, mode: RunMode) => {
      if (!project) return;
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const result = buildMarkdown(nodes, edges, nodeId, mode, project.name, project.path, language);
      if (result.nodes.every((item) => item.data.body.trim().length === 0)) {
        setStatus(t("status.cannotSendEmpty"));
        return;
      }
      const threadName = mode === "flow" ? `Scatter Flow: ${node.data.title || t("drawer.unnamedTask")}` : `Scatter: ${node.data.title || t("drawer.unnamedTask")}`;
      setStatus(t("status.sendingCodex"));
      try {
        await window.scatter.runCodex({
          projectPath: project.path,
          threadName,
          markdown: result.markdown,
          imagePaths: result.imagePaths,
          effort: node.data.effort || "xhigh",
          planMode: result.planMode
        });
        markNodeRun(nodeId, mode);
        setStatus(t("status.sentCodex"));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t("status.sendCodexFailed"));
      }
    },
    [edges, language, markNodeRun, nodes, project, setStatus, t]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((node) => node.id === nodeId);
      if (!source) return;
      const duplicate: ScatterNode = {
        ...duplicateNodeAt(source, {
          x: source.position.x + 32,
          y: source.position.y + 32
        }),
        data: {
          ...source.data,
          attachments: source.data.attachments.map((attachment) => ({ ...attachment })),
          title: defaultTaskTitle(nodes, t)
        }
      };
      commitCanvasChange({ nodes: [...nodes.map((node) => ({ ...node, selected: false })), duplicate] });
      setSelectedNodeId(duplicate.id);
    },
    [commitCanvasChange, nodes, setSelectedNodeId, t]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      commitCanvasChange({
        nodes: nodes.filter((node) => node.id !== nodeId),
        edges: edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [commitCanvasChange, edges, nodes, selectedNodeId, setSelectedNodeId]
  );

  useEffect(() => {
    setTaskNodeActions({
      updateNodeData,
      beginNodeEdit: beginHistoryTransaction,
      commitNodeEdit: commitHistoryTransaction,
      addFilesToNode,
      removeAttachment,
      duplicateNode,
      deleteNode,
      runNode
    });
  }, [addFilesToNode, beginHistoryTransaction, commitHistoryTransaction, deleteNode, duplicateNode, removeAttachment, runNode, updateNodeData]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ScatterNode>[]) => {
      const next = applyNodeChanges(changes as NodeChange[], nodes as Node<ScatterNodeData>[]) as Node<ScatterNodeData>[];
      const nextNodes = next.map((node) => ({ ...node, type: "task" as const })) as ScatterNode[];
      const hasStructuralChange = changes.some((change) => change.type === "add" || change.type === "remove" || change.type === "replace");
      const hasPositionChange = changes.some((change) => change.type === "position");
      const hasDraggingPosition = changes.some((change) => change.type === "position" && change.dragging);
      const removedNodeIds = changes.flatMap((change) => (change.type === "remove" ? [change.id] : []));

      if (hasStructuralChange) {
        commitCanvasChange({
          nodes: nextNodes,
          edges: removedNodeIds.length
            ? edges.filter((edge) => !removedNodeIds.includes(edge.source) && !removedNodeIds.includes(edge.target))
            : edges
        });
        return;
      }

      if (hasPositionChange) {
        const settledSourceId = optionDuplicateSettledSourceRef.current;
        if (settledSourceId && changes.some((change) => change.type === "position" && change.id === settledSourceId)) {
          return;
        }

        const optionDuplicateDrag = optionDuplicateDragRef.current;
        if (optionDuplicateDrag) {
          const draggedNode = nextNodes.find((node) => node.id === optionDuplicateDrag.sourceId);
          const nextPosition = draggedNode?.position ?? optionDuplicateDrag.lastPosition;
          optionDuplicateDrag.lastPosition = roundPosition(nextPosition);
          optionDuplicateDrag.hasPreview = true;
          nodeDragActiveRef.current = true;
          replaceCanvasLive({ nodes: optionDuplicatePreviewNodes(optionDuplicateDrag, optionDuplicateDrag.lastPosition) });
          setSelectedNodeId(optionDuplicateDrag.duplicateId);
          return;
        }

        if (hasDraggingPosition) {
          nodeDragActiveRef.current = true;
          if (!nodeDragHistoryOpenRef.current) {
            beginHistoryTransaction();
            nodeDragHistoryOpenRef.current = true;
          }
          replaceCanvasLive({ nodes: nextNodes });
          return;
        }

        if (nodeDragHistoryOpenRef.current) {
          nodeDragActiveRef.current = false;
          replaceCanvasLive({ nodes: nextNodes });
          commitHistoryTransaction();
          nodeDragHistoryOpenRef.current = false;
          return;
        }

        nodeDragActiveRef.current = false;
        commitCanvasChange({ nodes: nextNodes });
        return;
      }

      replaceCanvasLive({ nodes: nextNodes });
    },
    [beginHistoryTransaction, commitCanvasChange, commitHistoryTransaction, edges, nodes, replaceCanvasLive, setSelectedNodeId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ScatterEdge>[]) => {
      const next = applyEdgeChanges(changes as EdgeChange[], edges as Edge[]);
      const nextEdges = next.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: typeof (edge as Edge).label === "string" ? ((edge as Edge).label as string) : undefined
      }));
      const hasDocumentChange = changes.some((change) => change.type !== "select");

      if (hasDocumentChange) {
        commitCanvasChange({ edges: nextEdges });
        return;
      }

      replaceCanvasLive({ edges: nextEdges });
    },
    [commitCanvasChange, edges, replaceCanvasLive]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const next = addEdge(
          {
            ...connection,
            id: nanoid(),
            type: "scatter",
            animated: false
          },
          edges as Edge[]
      );
      commitCanvasChange({ edges: next.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })) });
    },
    [commitCanvasChange, edges]
  );

  const handleNodeDragStart = useCallback<OnNodeDrag<Node>>(
    (event, node) => {
      nodeDragActiveRef.current = true;

      if (!event.altKey) return;
      const source = nodes.find((item) => item.id === node.id);
      if (!source) return;

      optionDuplicateDragRef.current = {
        sourceId: node.id,
        duplicateId: nanoid(),
        originalNodes: nodes.map(cloneCanvasNode),
        lastPosition: source.position,
        hasPreview: false
      };
      beginHistoryTransaction();
    },
    [beginHistoryTransaction, nodes]
  );

  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>(
    () => {
      const optionDuplicateDrag = optionDuplicateDragRef.current;
      if (optionDuplicateDrag) {
        if (!optionDuplicateDrag.hasPreview) {
          optionDuplicateDragRef.current = null;
          nodeDragActiveRef.current = false;
          cancelHistoryTransaction();
          return;
        }

        optionDuplicateDragRef.current = null;
        nodeDragHistoryOpenRef.current = false;
        nodeDragActiveRef.current = false;
        optionDuplicateSettledSourceRef.current = optionDuplicateDrag.sourceId;
        replaceCanvasLive({ nodes: optionDuplicatePreviewNodes(optionDuplicateDrag, optionDuplicateDrag.lastPosition) });
        setSelectedNodeId(optionDuplicateDrag.duplicateId);
        commitHistoryTransaction();
        window.setTimeout(() => {
          if (optionDuplicateSettledSourceRef.current === optionDuplicateDrag.sourceId) {
            optionDuplicateSettledSourceRef.current = null;
          }
        }, 0);
        return;
      }

      window.setTimeout(() => {
        nodeDragActiveRef.current = false;
        if (!nodeDragHistoryOpenRef.current) return;
        commitHistoryTransaction();
        nodeDragHistoryOpenRef.current = false;
      }, 0);
    },
    [cancelHistoryTransaction, commitHistoryTransaction, replaceCanvasLive, setSelectedNodeId]
  );

  const selectCanvasNode = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const first = selectedNodes[0] as ScatterNode | undefined;
      selectCanvasNode(first?.id || null);
    },
    [selectCanvasNode]
  );

  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);
      if (isConnecting) {
        selectCanvasNode(node.id);
        replaceCanvasLive({ nodes: nodes.map((item) => ({ ...item, selected: item.id === node.id })) });
      }
    },
    [isConnecting, nodes, replaceCanvasLive, selectCanvasNode]
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      if (!project || settingsOpen || searchOpen) return;

      const files = event.clipboardData.files;
      if (files.length > 0) {
        event.preventDefault();
        beginHistoryTransaction();
        const target = ensureTargetNode();
        if (!target) {
          cancelHistoryTransaction();
          return;
        }

        try {
          await addFilesToNode(target.id, files, "paste");
          commitHistoryTransaction();
        } catch (error) {
          cancelHistoryTransaction();
          setStatus(error instanceof Error ? error.message : t("status.addAttachmentFailed"));
        }
        return;
      }

      const text = event.clipboardData.getData("text/plain");
      const savedImage = await window.scatter.saveClipboardImage(project.path);
      if (savedImage) {
        event.preventDefault();
        beginHistoryTransaction();
        const target = ensureTargetNode();
        if (!target) {
          cancelHistoryTransaction();
          return;
        }
        appendAttachments(target.id, [savedImage]);
        commitHistoryTransaction();
        return;
      }

      const savedFiles = await window.scatter.saveClipboardFiles(project.path);
      if (savedFiles.length) {
        event.preventDefault();
        beginHistoryTransaction();
        const target = ensureTargetNode();
        if (!target) {
          cancelHistoryTransaction();
          return;
        }
        appendAttachments(target.id, savedFiles);
        commitHistoryTransaction();
        return;
      }

      if (text && !isEditableTarget(event.target)) {
        event.preventDefault();
        beginHistoryTransaction();
        const target = ensureTargetNode();
        if (!target) {
          cancelHistoryTransaction();
          return;
        }
        updateNodeData(target.id, {
          body: `${target.data.body ? `${target.data.body}\n` : ""}${text}`
        });
        commitHistoryTransaction();
      }
    },
    [
      addFilesToNode,
      appendAttachments,
      beginHistoryTransaction,
      cancelHistoryTransaction,
      commitHistoryTransaction,
      ensureTargetNode,
      project,
      searchOpen,
      settingsOpen,
      setStatus,
      t,
      updateNodeData
    ]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      if (!project || settingsOpen || searchOpen || event.dataTransfer.files.length === 0) return;
      event.preventDefault();
      beginHistoryTransaction();
      const target = ensureTargetNode();
      if (!target) {
        cancelHistoryTransaction();
        return;
      }

      try {
        await addFilesToNode(target.id, event.dataTransfer.files, "drop");
        commitHistoryTransaction();
      } catch (error) {
        cancelHistoryTransaction();
        setStatus(error instanceof Error ? error.message : t("status.addAttachmentFailed"));
      }
    },
    [addFilesToNode, beginHistoryTransaction, cancelHistoryTransaction, commitHistoryTransaction, ensureTargetNode, project, searchOpen, settingsOpen, setStatus, t]
  );

  const runActiveNode = useCallback(() => {
    const target = selectedNode || nodes[0];
    if (!target) return;
    void runNode(target.id, selectedNode ? selectedRunMode : target.data.runMode || "flow");
  }, [nodes, runNode, selectedNode, selectedRunMode]);

  const fitCanvas = useCallback(() => {
    flowInstanceRef.current?.fitView({ padding: 0.24 });
  }, []);

  const toggleTasksDrawer = useCallback(() => {
    if (!project) return;
    setDrawer(drawer === "tasks" ? null : "tasks");
  }, [drawer, project, setDrawer]);

  const toggleMarkdownDrawer = useCallback(() => {
    if (!project) return;
    setDrawer(drawer === "markdown" ? null : "markdown");
  }, [drawer, project, setDrawer]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (settingsOpen || searchOpen || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;

      if (hasPrimaryModifier && !event.altKey) {
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }

        if (!event.shiftKey && key === "f") {
          event.preventDefault();
          setSearchOpen(true);
          return;
        }

        if (event.shiftKey && key === "n") {
          event.preventDefault();
          createProject();
          return;
        }

        if (!event.shiftKey && event.key === ",") {
          event.preventDefault();
          openSettingsDialog();
          return;
        }

        if (!event.shiftKey && key === "b") {
          event.preventDefault();
          setSidebarCollapsed((collapsed) => !collapsed);
          return;
        }

        if (project && !event.shiftKey && event.key === "Enter") {
          event.preventDefault();
          runActiveNode();
          return;
        }

        if (project && !event.shiftKey && key === "n") {
          event.preventDefault();
          addNode();
          return;
        }

        if (project && !event.shiftKey && key === "0") {
          event.preventDefault();
          fitCanvas();
          return;
        }

        if (project && event.shiftKey && key === "t") {
          event.preventDefault();
          toggleTasksDrawer();
          return;
        }

        if (project && event.shiftKey && key === "m") {
          event.preventDefault();
          toggleMarkdownDrawer();
          return;
        }
      }

      if (project && !hasPrimaryModifier && !event.altKey && !event.shiftKey) {
        if (key === "v") {
          event.preventDefault();
          setCanvasTool("select");
          return;
        }

        if (key === "h") {
          event.preventDefault();
          setCanvasTool("pan");
          return;
        }
      }

      if (!selectedNodeId || (event.key !== "Backspace" && event.key !== "Delete")) return;

      event.preventDefault();
      deleteNode(selectedNodeId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addNode,
    createProject,
    deleteNode,
    fitCanvas,
    openSettingsDialog,
    project,
    redo,
    runActiveNode,
    searchOpen,
    selectedNodeId,
    settingsOpen,
    toggleMarkdownDrawer,
    toggleTasksDrawer,
    undo
  ]);

  const focusCanvasNode = useCallback(
    (nodeId: string, mode: RunMode) => {
      setTaskRunModeOverride({ nodeId, mode });
      setSelectedNodeId(nodeId);
      replaceCanvasLive({ nodes: nodes.map((node) => ({ ...node, selected: node.id === nodeId })) });

      const target = nodes.find((node) => node.id === nodeId);
      if (!target) return;
      const bounds = nodeBounds(target);
      void flowInstanceRef.current?.setCenter(target.position.x + bounds.width / 2, target.position.y + bounds.height / 2, {
        duration: 240,
        zoom: viewportZoom
      });
    },
    [nodes, replaceCanvasLive, setSelectedNodeId, viewportZoom]
  );

  const startMarkdownResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drawer !== "markdown") return;
    const container = workspaceContentRef.current;
    if (!container) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingMarkdownPanel(true);

    const updateRatio = (clientX: number): void => {
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width - 12;
      if (totalWidth <= MARKDOWN_PANEL_MIN_WIDTH * 2) return;
      const markdownWidth = rect.right - clientX;
      const minRatio = MARKDOWN_PANEL_MIN_WIDTH / totalWidth;
      const maxRatio = 1 - minRatio;
      const nextRatio = Math.min(maxRatio, Math.max(minRatio, markdownWidth / totalWidth));
      setMarkdownPanelRatio(nextRatio);
    };

    updateRatio(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      updateRatio(moveEvent.clientX);
    };
    const stopResize = (): void => {
      setIsResizingMarkdownPanel(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [drawer]);

  if (isSplashWindow) {
    return (
      <I18nProvider language={language}>
        <main className="startup-shell" data-theme={theme}>
          <section className="startup-panel" aria-label={t("startup.loading")}>
            <div className="startup-copy">
              <div className="startup-title-group">
                <h1>Scatter</h1>
                <p>{t("startup.tagline")}</p>
              </div>
              <p className="startup-status">{t("startup.status")}</p>
            </div>
            <div className="startup-visual" aria-hidden="true">
              <div className="startup-image-frame">
                <img src={startupBulbImage} alt="" />
              </div>
            </div>
          </section>
        </main>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language}>
      <main
        className={`app-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onMouseMove={(event) => {
          latestMouseRef.current = { x: event.clientX, y: event.clientY };
        }}
      >
      <Sidebar
        recentProjects={recentProjects}
        activePath={project?.path}
        collapsed={sidebarCollapsed}
        onCreateProject={createProject}
        onOpenRecent={(projectPath) => window.scatter.openKnownProject(projectPath).then(hydrateProject)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={openSettingsDialog}
        onRemoveRecent={(projectPath) => void removeRecentProject(projectPath)}
      />
      <section className="workspace">
        <Topbar
          activeDrawer={drawer}
          canRun={nodes.length > 0}
          sidebarCollapsed={sidebarCollapsed}
          disabled={!project}
          onCreateProject={createProject}
          onRunActive={runActiveNode}
          onOpenTasks={toggleTasksDrawer}
          onOpenMarkdown={toggleMarkdownDrawer}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <div
          className={`workspace-content ${drawer ? "has-right-sidebar" : ""} ${drawer === "markdown" ? "has-markdown-sidebar" : ""} ${isResizingMarkdownPanel ? "is-resizing-markdown" : ""}`}
          ref={workspaceContentRef}
          style={
            drawer === "markdown"
              ? ({
                  "--markdown-panel-ratio": markdownPanelRatio,
                  "--canvas-panel-ratio": 1 - markdownPanelRatio
                } as CSSProperties)
              : undefined
          }
        >
          {project ? (
            <>
              <div
                className={`canvas-shell ${canvasRevealActive ? "is-revealing" : ""}`}
                ref={canvasShellRef}
                onAnimationEnd={(event) => {
                  if (event.animationName === "canvas-project-reveal") setCanvasRevealActive(false);
                }}
              >
                <ReactFlow
                  nodes={nodes as Node[]}
                  edges={
                    edges.map((edge) => ({
                      ...edge,
                      type: "scatter",
                      data: {
                        active:
                          edge.source === selectedNodeId ||
                          edge.target === selectedNodeId ||
                          edge.source === hoveredNodeId ||
                          edge.target === hoveredNodeId
                      }
                    })) as Edge[]
                  }
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange as any}
                  onEdgesChange={onEdgesChange as any}
                  onConnect={onConnect}
                  onSelectionChange={onSelectionChange}
                  selectionKeyCode={panModeActive ? null : "Shift"}
                  selectionOnDrag={false}
                  panOnDrag={panModeActive}
                  panActivationKeyCode="Space"
                  zoomOnScroll={false}
                  zoomOnPinch={false}
                  zoomOnDoubleClick={false}
                  zoomActivationKeyCode="Meta"
                  nodesDraggable={!panModeActive}
                  onConnectStart={() => setIsConnecting(true)}
                  onConnectEnd={() => setIsConnecting(false)}
                  onNodeMouseEnter={handleNodeMouseEnter}
                  onNodeMouseLeave={() => setHoveredNodeId(null)}
                  onNodeDragStart={handleNodeDragStart}
                  onNodeDragStop={handleNodeDragStop}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance;
                  }}
                  onMove={(_, viewport) => {
                    setViewportZoom(viewport.zoom);
                  }}
                  fitView
                  minZoom={0.2}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={{
                    type: "scatter"
                  }}
                >
                  <Background gap={200} size={0} color="transparent" />
                </ReactFlow>
                <div className="canvas-actions" aria-label={t("canvas.actions")}>
                  <TooltipAnchor label={t("canvas.fit")} shortcut={shortcuts.fitCanvas} side="right">
                    <IconButton className="canvas-tool-button" filled={false} icon="map-pin" size="lg" aria-label={t("canvas.fit")} onClick={fitCanvas} />
                  </TooltipAnchor>
                  <TooltipAnchor label={t("canvas.undo")} shortcut={shortcuts.undo} side="right">
                    <IconButton className="canvas-tool-button" filled={false} icon="undo" size="lg" aria-label={t("canvas.undo")} disabled={!canUndo} onClick={undo} />
                  </TooltipAnchor>
                  <TooltipAnchor label={t("canvas.redo")} shortcut={shortcuts.redo} side="right">
                    <IconButton className="canvas-tool-button" filled={false} icon="redo" size="lg" aria-label={t("canvas.redo")} disabled={!canRedo} onClick={redo} />
                  </TooltipAnchor>
                </div>
                <div className="canvas-toolbar" aria-label={t("canvas.tools")}>
                  <TooltipAnchor label={t("canvas.addNode")} shortcut={shortcuts.addNode}>
                    <IconButton className="canvas-toolbar-button" filled={false} icon="plus-lg" size="lg" aria-label={t("canvas.addNode")} onClick={addNode} />
                  </TooltipAnchor>
                  <span className="canvas-toolbar-divider" />
                  <TooltipAnchor label={t("canvas.selectTool")} shortcut={shortcuts.selectTool}>
                    <IconButton
                      className={`canvas-toolbar-button ${canvasTool === "select" && !spacePanActive ? "is-selected" : ""}`}
                      filled={false}
                      icon="work-with-apps"
                      size="lg"
                      aria-label={t("canvas.selectTool")}
                      aria-pressed={canvasTool === "select" && !spacePanActive}
                      onClick={() => setCanvasTool("select")}
                    />
                  </TooltipAnchor>
                  <TooltipAnchor label={t("canvas.panTool")} shortcut={shortcuts.panTool}>
                    <IconButton
                      className={`canvas-toolbar-button ${panModeActive ? "is-selected" : ""}`}
                      filled={false}
                      icon="hand-raised"
                      size="lg"
                      aria-label={t("canvas.panTool")}
                      aria-pressed={panModeActive}
                      onClick={() => setCanvasTool("pan")}
                    />
                  </TooltipAnchor>
                  <span className="canvas-toolbar-divider" />
                  <TooltipAnchor label={t("canvas.zoom")}>
                    <RadixDropdownMenu.Root>
                      <RadixDropdownMenu.Trigger asChild>
                        <button className="canvas-zoom-trigger" type="button" aria-label={t("canvas.zoom")}>
                          <span>{zoomPercent}%</span>
                          <Icon name="chevron-down" size={16} />
                        </button>
                      </RadixDropdownMenu.Trigger>
                      <RadixDropdownMenu.Portal>
                        <RadixDropdownMenu.Content className="canvas-zoom-popover" side="top" sideOffset={8} align="end">
                          <DropdownMenu className="canvas-zoom-menu" role="menu">
                            {zoomOptions.map((option) => (
                              <RadixDropdownMenu.Item key={option.value} asChild>
                                <DropdownMenuItem
                                  label={option.label}
                                  selected={Math.abs(viewportZoom - option.value) < 0.01}
                                  role="menuitemradio"
                                  aria-checked={Math.abs(viewportZoom - option.value) < 0.01}
                                  onClick={() => {
                                    setViewportZoom(option.value);
                                    void flowInstanceRef.current?.zoomTo(option.value);
                                  }}
                                />
                              </RadixDropdownMenu.Item>
                            ))}
                          </DropdownMenu>
                        </RadixDropdownMenu.Content>
                      </RadixDropdownMenu.Portal>
                    </RadixDropdownMenu.Root>
                  </TooltipAnchor>
                </div>
              </div>
              <button
                className={`workspace-resize-handle ${drawer === "markdown" ? "is-active" : ""}`}
                type="button"
                aria-hidden={drawer !== "markdown"}
                aria-label={t("canvas.resizeMarkdown")}
                disabled={drawer !== "markdown"}
                tabIndex={drawer === "markdown" ? 0 : -1}
                onPointerDown={startMarkdownResize}
              />
              <RightDrawer
                drawer={drawer}
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                markdown={markdownResult.markdown}
                currentRunMode={selectedRunMode}
                onSelectNode={focusCanvasNode}
                onRunNode={runNode}
              />
            </>
          ) : (
            <div className="empty-workspace" aria-label={t("canvas.emptyWorkspace")}>
              <Icon name="folder-stuffed" size={32} />
              <p>{t("canvas.emptyWorkspace")}</p>
            </div>
          )}
        </div>
      </section>
      <SettingsDialog
        open={settingsOpen}
        themePreference={themePreference}
        language={language}
        translucentBackground={translucentBackground}
        onOpenChange={handleSettingsOpenChange}
        onPreview={applySettingsValues}
        onSave={handleSaveSettings}
      />
      <SearchDialog
        open={searchOpen}
        projects={recentProjects}
        onOpenChange={setSearchOpen}
        onOpenProject={(projectPath) => window.scatter.openKnownProject(projectPath).then(hydrateProject)}
      />
      </main>
    </I18nProvider>
  );
}

export default App;
