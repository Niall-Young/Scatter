import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Background,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnSelectionChangeParams,
  type OnNodeDrag,
  type OnConnectEnd,
  type OnConnectStart,
  type OnMove,
  PanOnScrollMode,
  type ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  type EdgeTypes,
  type NodeTypes,
  getBezierPath,
  Position,
  type ConnectionLineComponentProps
} from "@xyflow/react";
import { nanoid } from "nanoid";
import type {
  AchievementState,
  AppUpdateState,
  AssistantProvider,
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
import { defaultAchievementState, defaultAppSettings } from "../../shared/types";
import { buildMarkdown } from "./lib/markdown";
import { I18nProvider } from "./lib/i18n";
import { shortcuts } from "./lib/shortcuts";
import { createTranslator } from "./lib/translations";
import { achievements, type AchievementDefinition } from "./lib/achievements";
import { AchievementToast } from "./components/AchievementToast";
import { AchievementsWall } from "./components/AchievementsWall";
import { AccessibilityPermissionDialog } from "./components/AccessibilityPermissionDialog";
import { AssistantProviderPreferenceDialog } from "./components/AssistantProviderPreferenceDialog";
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
const defaultEdgeOptions = { type: "scatter" };
const proOptions = { hideAttribution: true };
const TASK_NODE_WIDTH = 400;
const TASK_NODE_HEIGHT = 220;
const TASK_NODE_HORIZONTAL_GAP = 180;
const TASK_NODE_VERTICAL_GAP = 72;
const NODE_CONNECT_BUTTON_SIZE = 20;
const MARKDOWN_PANEL_DEFAULT_RATIO = 0.5;
const MARKDOWN_PANEL_MIN_WIDTH = 360;
const zoomOptions = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 }
];

const initialUpdateState = {
  status: "idle",
  currentVersion: "0.0.0",
  isPackaged: false,
  canCheck: false,
  canInstall: false
} satisfies AppUpdateState;

type FlowPosition = { x: number; y: number };
type MeasuredScatterNode = ScatterNode & { measured?: { width?: number; height?: number } };
type AppView = "canvas" | "achievements";
type CanvasTool = "select" | "pan";
type ConnectedNodeSide = "left" | "right";
interface ConnectionStart {
  nodeId: string;
  handleType: "source" | "target";
}
interface ConnectionHoverTarget {
  sourceId: string;
  targetId: string;
  hoveredNodeId: string;
}
interface OptionDuplicateDrag {
  sourceId: string;
  duplicateId: string;
  originalNodes: ScatterNode[];
  lastPosition: FlowPosition;
  hasPreview: boolean;
}

const CONNECTION_PREVIEW_EDGE_ID = "__scatter-connection-preview__";

function connectionLineStartX(x: number, position: Position): number {
  const offset = NODE_CONNECT_BUTTON_SIZE / 2;
  if (position === Position.Left) return x - offset;
  if (position === Position.Right) return x + offset;
  return x;
}

function ScatterConnectionLine({
  connectionLineStyle,
  fromPosition,
  fromX,
  fromY,
  toPosition,
  toX,
  toY
}: ConnectionLineComponentProps): ReactElement {
  const [path] = getBezierPath({
    sourceX: connectionLineStartX(fromX, fromPosition),
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    curvature: 0.45
  });

  return <path className="scatter-connection-path" d={path} style={connectionLineStyle} />;
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

function stringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function scatterEdgesEqual(left: ScatterEdge[], right: ScatterEdge[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((edge, index) => {
    const other = right[index];
    return edge.id === other.id && edge.source === other.source && edge.target === other.target && edge.label === other.label;
  });
}

function scatterNodesEqualForLive(left: ScatterNode[], right: ScatterNode[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((node, index) => {
    const other = right[index];
    return (
      node.id === other.id &&
      node.type === other.type &&
      node.position.x === other.position.x &&
      node.position.y === other.position.y &&
      node.width === other.width &&
      node.height === other.height &&
      node.selected === other.selected &&
      node.data === other.data
    );
  });
}

function eventClientPosition(event: MouseEvent | TouchEvent): FlowPosition | null {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  return { x: event.clientX, y: event.clientY };
}

function nodeIdFromConnectionEvent(event: MouseEvent | TouchEvent): string | null {
  const clientPosition = eventClientPosition(event);
  const pointTarget = clientPosition ? document.elementFromPoint(clientPosition.x, clientPosition.y) : null;
  const eventTarget = event.target instanceof Element ? event.target : null;

  for (const target of [pointTarget, eventTarget]) {
    const nodeElement = target?.closest(".react-flow__node[data-id]");
    const nodeId = nodeElement?.getAttribute("data-id");
    if (nodeId) return nodeId;
  }

  return null;
}

function nodeBounds(node: ScatterNode): { width: number; height: number } {
  const measured = (node as MeasuredScatterNode).measured;

  return {
    width: node.width ?? measured?.width ?? TASK_NODE_WIDTH,
    height: node.height ?? measured?.height ?? TASK_NODE_HEIGHT
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

function positionIntersectsNode(position: FlowPosition, node: ScatterNode): boolean {
  const bounds = nodeBounds(node);
  const left = position.x;
  const right = position.x + TASK_NODE_WIDTH;
  const top = position.y;
  const bottom = position.y + TASK_NODE_HEIGHT;
  const nodeLeft = node.position.x;
  const nodeRight = node.position.x + bounds.width;
  const nodeTop = node.position.y;
  const nodeBottom = node.position.y + bounds.height;

  return left < nodeRight && right > nodeLeft && top < nodeBottom && bottom > nodeTop;
}

function isConnectionDropPositionOpen(position: FlowPosition, nodes: ScatterNode[]): boolean {
  return nodes.every((node) => !positionIntersectsNode(position, node));
}

function findConnectionDropPosition(dropPosition: FlowPosition, handleType: ConnectionStart["handleType"], sourceNode: ScatterNode, nodes: ScatterNode[]): FlowPosition {
  const sourceBounds = nodeBounds(sourceNode);
  const directionalGap = 16;
  const base = roundPosition({
    x: handleType === "source" ? dropPosition.x : dropPosition.x - TASK_NODE_WIDTH,
    y: dropPosition.y - TASK_NODE_HEIGHT / 2
  });

  const directionAdjusted = positionIntersectsNode(base, sourceNode)
    ? roundPosition({
        ...base,
        x: handleType === "source" ? sourceNode.position.x + sourceBounds.width + directionalGap : sourceNode.position.x - TASK_NODE_WIDTH - directionalGap
      })
    : base;
  if (isConnectionDropPositionOpen(directionAdjusted, nodes)) return directionAdjusted;

  const offsets = [0, 48, -48, 96, -96, 144, -144, 192, -192, 240, -240, 288, -288];
  for (const yOffset of offsets) {
    const candidate = roundPosition({
      x: directionAdjusted.x,
      y: directionAdjusted.y + yOffset
    });
    if (isConnectionDropPositionOpen(candidate, nodes)) return candidate;
  }

  for (const xOffset of offsets.slice(1)) {
    for (const yOffset of offsets) {
      const candidate = roundPosition({
        x: directionAdjusted.x + xOffset,
        y: directionAdjusted.y + yOffset
      });
      if (isConnectionDropPositionOpen(candidate, nodes)) return candidate;
    }
  }

  return directionAdjusted;
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

function findOpenPositionToLeft(preferred: FlowPosition, nodes: ScatterNode[]): FlowPosition {
  const base = roundPosition(preferred);
  if (isOpenPosition(base, nodes)) return base;

  const stepX = TASK_NODE_WIDTH + TASK_NODE_HORIZONTAL_GAP;
  const stepY = TASK_NODE_HEIGHT + TASK_NODE_VERTICAL_GAP;
  const rowOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (let column = 0; column <= 4; column += 1) {
    for (const row of rowOffsets) {
      const candidate = roundPosition({
        x: preferred.x - column * stepX,
        y: preferred.y + row * stepY
      });
      if (isOpenPosition(candidate, nodes)) return candidate;
    }
  }

  return base;
}

function connectionFromStart(connectionStart: ConnectionStart, targetNodeId: string): Pick<ScatterEdge, "source" | "target"> | null {
  if (connectionStart.nodeId === targetNodeId) return null;

  return connectionStart.handleType === "source"
    ? { source: connectionStart.nodeId, target: targetNodeId }
    : { source: targetNodeId, target: connectionStart.nodeId };
}

function isConnectionAllowed(connection: Pick<ScatterEdge, "source" | "target">, edges: ScatterEdge[]): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return false;
  if (edges.some((edge) => edge.target === connection.target)) return false;
  return true;
}

function edgesForExistingNodes(edges: ScatterEdge[], nodes: ScatterNode[]): ScatterEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
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

function nodeForDocument(node: ScatterNode): ScatterNode {
  const { attachments, ...dataRest } = node.data;
  const documentNode: ScatterNode = {
    id: node.id,
    type: "task",
    position: { ...node.position },
    data: {
      ...dataRest,
      attachments: attachments.map((attachment) => ({ ...attachment }))
    } as ScatterNodeData
  };

  if (typeof node.width === "number") documentNode.width = node.width;
  if (typeof node.height === "number") documentNode.height = node.height;
  return documentNode;
}

function edgeForDocument(edge: ScatterEdge): ScatterEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label
  };
}

function toDocument(projectName: string, nodes: ScatterNode[], edges: ScatterEdge[]): ScatterDocument {
  return {
    version: 1,
    projectName,
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: nodes.map(nodeForDocument),
    edges: edges.map(edgeForDocument)
  };
}

function documentContentKey(projectName: string, nodes: ScatterNode[], edges: ScatterEdge[]): string {
  const document = toDocument(projectName, nodes, edges);
  return JSON.stringify({
    projectName: document.projectName,
    viewport: document.viewport,
    nodes: document.nodes,
    edges: document.edges
  });
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
  const [achievementState, setAchievementState] = useState<AchievementState>(() => ({
    ...defaultAchievementState,
    unlockedAt: {},
    projectPaths: [],
    usageDates: []
  }));
  const [achievementToastQueue, setAchievementToastQueue] = useState<AchievementDefinition[]>([]);
  const [activeView, setActiveView] = useState<AppView>("canvas");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(defaultAppSettings.themePreference);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => systemColorTheme());
  const [language, setLanguage] = useState<LanguagePreference>(defaultAppSettings.language);
  const [translucentBackground, setTranslucentBackground] = useState<boolean>(defaultAppSettings.translucentBackground);
  const [assistantProvider, setAssistantProvider] = useState<AssistantProvider>(defaultAppSettings.assistantProvider);
  const [assistantProviderOnboardingCompleted, setAssistantProviderOnboardingCompleted] = useState<boolean>(
    defaultAppSettings.assistantProviderOnboardingCompleted
  );
  const [assistantProviderPreferenceOpen, setAssistantProviderPreferenceOpen] = useState(false);
  const [accessibilityPermissionOpen, setAccessibilityPermissionOpen] = useState(false);
  const [accessibilityTrusted, setAccessibilityTrusted] = useState<boolean | null>(null);
  const [updateState, setUpdateState] = useState<AppUpdateState>(initialUpdateState);
  const [markdownPanelRatio, setMarkdownPanelRatio] = useState(MARKDOWN_PANEL_DEFAULT_RATIO);
  const [isResizingMarkdownPanel, setIsResizingMarkdownPanel] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionPreview, setConnectionPreview] = useState<ConnectionHoverTarget | null>(null);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [shiftSelectionActive, setShiftSelectionActive] = useState(false);
  const [shiftSelectionDragging, setShiftSelectionDragging] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [canvasRevealActive, setCanvasRevealActive] = useState(false);
  const windowSearchParams = new URLSearchParams(window.location.search);
  const isSplashWindow = windowSearchParams.get("window") === "splash";
  const appVersion = windowSearchParams.get("version")?.trim() || "0.0.0";
  const appPlatform = windowSearchParams.get("platform")?.trim() || "darwin";
  const isWindows = appPlatform === "win32";
  const supportsMacAutomation = appPlatform === "darwin";
  const saveTimerRef = useRef<number | null>(null);
  const loadedProjectPathRef = useRef<string | null>(null);
  const skipNextAutosavePathRef = useRef<string | null>(null);
  const lastSavedDocumentKeyRef = useRef<string | null>(null);
  const latestMouseRef = useRef({ x: 360, y: 240 });
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement | null>(null);
  const nodeDragActiveRef = useRef(false);
  const nodeDragHistoryOpenRef = useRef(false);
  const optionDuplicateDragRef = useRef<OptionDuplicateDrag | null>(null);
  const optionDuplicateSettledSourceRef = useRef<string | null>(null);
  const connectionStartRef = useRef<ConnectionStart | null>(null);
  const connectionSucceededRef = useRef(false);
  const connectionHoverTargetRef = useRef<ConnectionHoverTarget | null>(null);
  const achievementStateRef = useRef<AchievementState>(achievementState);
  const achievementsLoadedRef = useRef(false);
  const settingsSnapshotRef = useRef<SettingsValues | null>(null);
  const settingsSaveRequestedRef = useRef(false);
  const assistantRunInFlightRef = useRef(false);
  const accessibilityStartupPromptShownRef = useRef(false);
  const accessibilityPromptDismissedRef = useRef(false);
  const [taskRunModeOverride, setTaskRunModeOverride] = useState<{ nodeId: string; mode: RunMode } | null>(null);
  const t = useMemo(() => createTranslator(language), [language]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedRunModeOverride = taskRunModeOverride && taskRunModeOverride.nodeId === selectedNode?.id ? taskRunModeOverride.mode : null;
  const selectedRunMode = selectedRunModeOverride ?? selectedNode?.data.runMode ?? "flow";
  const isCanvasView = activeView === "canvas";
  const isAchievementsView = activeView === "achievements";
  const panModeActive = canvasTool === "pan" || spacePanActive;
  const effectiveTranslucentBackground = !isWindows && translucentBackground;

  const updateConnectionHoverTarget = useCallback((target: ConnectionHoverTarget | null) => {
    const current = connectionHoverTargetRef.current;
    const unchanged =
      current?.sourceId === target?.sourceId &&
      current?.targetId === target?.targetId &&
      current?.hoveredNodeId === target?.hoveredNodeId;
    if (unchanged) return;

    connectionHoverTargetRef.current = target;
    setConnectionPreview(target);
  }, []);

  const clearConnectionHoverTarget = useCallback(() => {
    updateConnectionHoverTarget(null);
  }, [updateConnectionHoverTarget]);

  useEffect(() => {
    setSelectedEdgeIds((current) => {
      const next = current.filter((id) => edges.some((edge) => edge.id === id));
      return stringArraysEqual(current, next) ? current : next;
    });
  }, [edges]);

  useEffect(() => {
    if (!connectionPreview) return;
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (!nodeIds.has(connectionPreview.sourceId) || !nodeIds.has(connectionPreview.targetId)) {
      clearConnectionHoverTarget();
    }
  }, [clearConnectionHoverTarget, connectionPreview, nodes]);

  const zoomPercent = Math.round(viewportZoom * 100);
  const markdownResult = useMemo(
    () =>
      project && selectedNode
        ? buildMarkdown(nodes, edges, selectedNode.id, "flow", project.name, project.path, language)
        : {
            markdown: "",
            nodes: [],
            attachments: [],
            imagePaths: [],
            planMode: false,
            hasCycle: false
          },
    [edges, language, nodes, project, selectedNode]
  );

  const flowNodeIdsKey = useMemo(() => nodes.map((node) => node.id).join("\u0000"), [nodes]);
  const flowNodeIds = useMemo(() => new Set(flowNodeIdsKey ? flowNodeIdsKey.split("\u0000") : []), [flowNodeIdsKey]);

  const flowEdges = useMemo(() => {
    const activeNodeIds = new Set(
      [selectedNodeId, hoveredNodeId, connectionPreview?.sourceId, connectionPreview?.targetId].filter(Boolean) as string[]
    );
    const validEdges = edges.filter((edge) => flowNodeIds.has(edge.source) && flowNodeIds.has(edge.target));
    const canSelectEdges = !shiftSelectionActive;
    const renderedEdges = validEdges.map((edge) => ({
      ...edge,
      type: "scatter",
      selectable: canSelectEdges,
      selected: canSelectEdges && selectedEdgeIds.includes(edge.id),
      data: {
        active: (canSelectEdges && selectedEdgeIds.includes(edge.id)) || activeNodeIds.has(edge.source) || activeNodeIds.has(edge.target)
      }
    })) as Edge[];

    if (connectionPreview && flowNodeIds.has(connectionPreview.sourceId) && flowNodeIds.has(connectionPreview.targetId)) {
      renderedEdges.push({
        id: CONNECTION_PREVIEW_EDGE_ID,
        source: connectionPreview.sourceId,
        target: connectionPreview.targetId,
        type: "scatter",
        selectable: false,
        data: {
          active: true
        }
      } as Edge);
    }

    return renderedEdges;
  }, [connectionPreview, edges, flowNodeIds, hoveredNodeId, selectedEdgeIds, selectedNodeId, shiftSelectionActive]);

  useEffect(() => {
    if (drawer === "markdown" && !selectedNode) {
      setDrawer(null);
    }
  }, [drawer, selectedNode, setDrawer]);

  useEffect(() => {
    if (!canvasRevealActive) return;
    const timer = window.setTimeout(() => setCanvasRevealActive(false), 520);
    return () => window.clearTimeout(timer);
  }, [canvasRevealActive]);

  const refreshRecentProjects = useCallback(async () => {
    setRecentProjects(await window.scatter.getRecentProjects());
  }, []);

  const refreshAchievements = useCallback(async (options: { notify?: boolean } = {}) => {
    const previousState = achievementStateRef.current;
    const nextState = await window.scatter.getAchievements();
    achievementStateRef.current = nextState;
    setAchievementState(nextState);

    if (options.notify && achievementsLoadedRef.current) {
      const newlyUnlocked = achievements.filter((achievement) => !previousState.unlockedAt[achievement.id] && nextState.unlockedAt[achievement.id]);
      if (newlyUnlocked.length) {
        setAchievementToastQueue((queue) => [...queue, ...newlyUnlocked]);
      }
    }

    achievementsLoadedRef.current = true;
    return nextState;
  }, []);

  const closeAchievementToast = useCallback((): void => {
    setAchievementToastQueue((queue) => queue.slice(1));
  }, []);

  useEffect(() => {
    if (!achievementToastQueue[0]) return undefined;
    const timer = window.setTimeout(closeAchievementToast, 4800);
    return () => window.clearTimeout(timer);
  }, [achievementToastQueue, closeAchievementToast]);

  const removeRecentProject = useCallback(
    async (projectPath: string) => {
      const removesCurrentProject = project?.path === projectPath;
      const currentDocumentKey =
        removesCurrentProject && project ? documentContentKey(project.name, nodes, edges) : lastSavedDocumentKeyRef.current;
      if (removesCurrentProject && saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (removesCurrentProject) {
        loadedProjectPathRef.current = null;
        lastSavedDocumentKeyRef.current = null;
      }

      try {
        setRecentProjects(await window.scatter.removeRecentProject(projectPath));
        await refreshAchievements({ notify: true });
        if (removesCurrentProject) {
          clearProject();
          setCanvasRevealActive(false);
        }
        setStatus(t("status.removedRecent"));
      } catch (error) {
        if (removesCurrentProject && useScatterStore.getState().project?.path === projectPath) {
          loadedProjectPathRef.current = projectPath;
          lastSavedDocumentKeyRef.current = currentDocumentKey;
        }
        setStatus(error instanceof Error ? error.message : t("status.removeRecentFailed"));
      }
    },
    [clearProject, edges, nodes, project, refreshAchievements, setStatus, t]
  );

  const reorderRecentProjects = useCallback(
    async (projectPaths: string[]) => {
      const previousProjects = recentProjects;
      const byPath = new Map(recentProjects.map((recentProject) => [recentProject.path, recentProject]));
      const orderedProjects = projectPaths
        .map((projectPath) => byPath.get(projectPath))
        .filter((recentProject): recentProject is ScatterProjectInfo => Boolean(recentProject));
      const orderedPathSet = new Set(orderedProjects.map((recentProject) => recentProject.path));
      const optimisticProjects = [
        ...orderedProjects,
        ...recentProjects.filter((recentProject) => !orderedPathSet.has(recentProject.path))
      ];

      setRecentProjects(optimisticProjects);
      try {
        setRecentProjects(await window.scatter.reorderRecentProjects(projectPaths));
        setStatus(t("status.projectOrderSaved"));
      } catch {
        setRecentProjects(previousProjects);
        setStatus(t("status.projectOrderSaveFailed"));
      }
    },
    [recentProjects, setStatus, t]
  );

  const applySettingsValues = useCallback((values: SettingsValues): void => {
    setThemePreference(values.themePreference);
    setLanguage(values.language);
    setTranslucentBackground(values.translucentBackground);
    setAssistantProvider(values.assistantProvider);
    setAssistantProviderOnboardingCompleted(values.assistantProviderOnboardingCompleted);
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.scatter
      .getSettings()
      .then((settings) => {
        if (!cancelled) {
          applySettingsValues(settings);
          setSettingsLoaded(true);
          if (!isSplashWindow && !settings.assistantProviderOnboardingCompleted) {
            setAssistantProviderPreferenceOpen(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          applySettingsValues(defaultAppSettings);
          setSettingsLoaded(true);
          if (!isSplashWindow) {
            setAssistantProviderPreferenceOpen(true);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applySettingsValues, isSplashWindow]);

  const openSettingsDialog = useCallback((): void => {
    settingsSaveRequestedRef.current = false;
    settingsSnapshotRef.current = {
      themePreference,
      language,
      translucentBackground,
      assistantProvider,
      assistantProviderOnboardingCompleted
    };
    setSettingsOpen(true);
  }, [assistantProvider, assistantProviderOnboardingCompleted, language, themePreference, translucentBackground]);

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

  const saveAssistantProviderPreference = useCallback(
    async (nextAssistantProvider: AssistantProvider): Promise<void> => {
      const savedSettings = await window.scatter.saveSettings({
        themePreference,
        language,
        translucentBackground,
        assistantProvider: nextAssistantProvider,
        assistantProviderOnboardingCompleted: true
      });
      applySettingsValues(savedSettings);
      setAssistantProviderPreferenceOpen(false);
    },
    [applySettingsValues, language, themePreference, translucentBackground]
  );

  const dismissAssistantProviderPreference = useCallback(async (): Promise<void> => {
    const savedSettings = await window.scatter.saveSettings({
      themePreference,
      language,
      translucentBackground,
      assistantProvider,
      assistantProviderOnboardingCompleted: true
    });
    applySettingsValues(savedSettings);
    setAssistantProviderPreferenceOpen(false);
  }, [applySettingsValues, assistantProvider, language, themePreference, translucentBackground]);

  const refreshAccessibilityPermission = useCallback(async (): Promise<boolean> => {
    if (!supportsMacAutomation) {
      setAccessibilityTrusted(true);
      setAccessibilityPermissionOpen(false);
      return true;
    }

    const status = await window.scatter.accessibility.getStatus();
    setAccessibilityTrusted(status.trusted);
    if (status.trusted) {
      setAccessibilityPermissionOpen(false);
      void window.scatter.accessibility.closeGuide().catch(() => undefined);
    }
    return status.trusted;
  }, [supportsMacAutomation]);

  const openAccessibilityGuide = useCallback(async (): Promise<void> => {
    if (!supportsMacAutomation) return;

    const resetStatus = await window.scatter.accessibility.resetPermission();
    setAccessibilityTrusted(resetStatus.trusted);
    const guideStatus = await window.scatter.accessibility.openGuide();
    setAccessibilityTrusted(guideStatus.trusted);
    if (guideStatus.trusted) {
      setAccessibilityPermissionOpen(false);
      void window.scatter.accessibility.closeGuide().catch(() => undefined);
      return;
    }
  }, [supportsMacAutomation]);

  const dismissAccessibilityPermission = useCallback((): void => {
    accessibilityPromptDismissedRef.current = true;
    setAccessibilityPermissionOpen(false);
    void window.scatter.accessibility.closeGuide().catch(() => undefined);
  }, []);

  const ensureAccessibilityPermission = useCallback(async (): Promise<boolean> => {
    if (!supportsMacAutomation) return true;

    try {
      const trusted = await refreshAccessibilityPermission();
      if (trusted) return true;
      accessibilityPromptDismissedRef.current = false;
      setAccessibilityPermissionOpen(true);
      setStatus(t("status.accessibilityPermissionRequired"));
      return false;
    } catch {
      setAccessibilityPermissionOpen(true);
      setStatus(t("status.accessibilityPermissionRequired"));
      return false;
    }
  }, [refreshAccessibilityPermission, setStatus, supportsMacAutomation, t]);

  useEffect(() => {
    if (
      !supportsMacAutomation ||
      isSplashWindow ||
      !settingsLoaded ||
      assistantProviderPreferenceOpen ||
      accessibilityStartupPromptShownRef.current
    ) {
      return;
    }
    accessibilityStartupPromptShownRef.current = true;
    let cancelled = false;

    window.scatter.accessibility
      .getStatus()
      .then((status) => {
        if (cancelled) return;
        setAccessibilityTrusted(status.trusted);
        if (!status.trusted && !accessibilityPromptDismissedRef.current) {
          setAccessibilityPermissionOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccessibilityPermissionOpen(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assistantProviderPreferenceOpen, isSplashWindow, settingsLoaded, supportsMacAutomation]);

  useEffect(() => {
    if (isSplashWindow || !supportsMacAutomation) return undefined;

    const handleFocus = (): void => {
      void refreshAccessibilityPermission().catch(() => undefined);
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isSplashWindow, refreshAccessibilityPermission, supportsMacAutomation]);

  useEffect(() => {
    if (isSplashWindow || !supportsMacAutomation || !accessibilityPermissionOpen || accessibilityTrusted === true) return undefined;

    const timer = window.setInterval(() => {
      void refreshAccessibilityPermission().catch(() => undefined);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [accessibilityPermissionOpen, accessibilityTrusted, isSplashWindow, refreshAccessibilityPermission, supportsMacAutomation]);

  useEffect(() => {
    if (!isSplashWindow) {
      void refreshRecentProjects();
      void refreshAchievements();
    }
  }, [isSplashWindow, refreshAchievements, refreshRecentProjects]);

  useEffect(() => {
    if (isSplashWindow) return undefined;

    let cancelled = false;
    window.scatter.updates
      .getState()
      .then((state) => {
        if (!cancelled) setUpdateState(state);
      })
      .catch(() => undefined);

    const unsubscribe = window.scatter.updates.onStateChange((state) => {
      setUpdateState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isSplashWindow]);

  const runTopbarUpdateAction = useCallback(async (): Promise<void> => {
    if (updateState.status === "checking" || updateState.status === "downloading" || updateState.status === "installing") return;

    try {
      const nextState =
        updateState.canInstall || updateState.status === "downloaded"
          ? await window.scatter.updates.install()
          : updateState.status === "available"
            ? await window.scatter.updates.download()
            : updateState;
      setUpdateState(nextState);
    } catch {
      return;
    }
  }, [updateState]);

  useEffect(() => {
    if (isSplashWindow) return undefined;

    const refresh = (): void => {
      void refreshRecentProjects();
    };
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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
    document.documentElement.dataset.platform = appPlatform;
    document.documentElement.dataset.translucent = effectiveTranslucentBackground ? "true" : "false";
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [appPlatform, effectiveTranslucentBackground, isSplashWindow, language, theme]);

  useEffect(() => {
    function isSpaceKey(event: KeyboardEvent): boolean {
      return event.code === "Space" || event.key === " ";
    }

    function isShiftKey(event: KeyboardEvent): boolean {
      return event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight";
    }

    function canvasShortcutBlocked(event: KeyboardEvent): boolean {
      return (
        !isCanvasView ||
        assistantProviderPreferenceOpen ||
        accessibilityPermissionOpen ||
        settingsOpen ||
        searchOpen ||
        isEditableTarget(event.target)
      );
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (canvasShortcutBlocked(event)) return;

      if (isShiftKey(event)) {
        setShiftSelectionActive(true);
        setSelectedEdgeIds((current) => (current.length ? [] : current));
        return;
      }

      if (!isSpaceKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSpacePanActive(true);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (isShiftKey(event) && !event.shiftKey) {
        setShiftSelectionActive(false);
        setShiftSelectionDragging(false);
        return;
      }

      if (!isSpaceKey(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSpacePanActive(false);
    }

    function resetTransientCanvasKeys(): void {
      setSpacePanActive(false);
      setShiftSelectionActive(false);
      setShiftSelectionDragging(false);
    }

    function handlePointerUp(event: PointerEvent): void {
      setShiftSelectionDragging(false);
      if (!event.shiftKey) setShiftSelectionActive(false);
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState !== "visible") resetTransientCanvasKeys();
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", resetTransientCanvasKeys, { capture: true });
    window.addEventListener("blur", resetTransientCanvasKeys);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      window.removeEventListener("pointercancel", resetTransientCanvasKeys, { capture: true });
      window.removeEventListener("blur", resetTransientCanvasKeys);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accessibilityPermissionOpen, assistantProviderPreferenceOpen, isCanvasView, searchOpen, settingsOpen]);

  useEffect(() => {
    if (isCanvasView && !assistantProviderPreferenceOpen && !accessibilityPermissionOpen && !settingsOpen && !searchOpen) return;
    setSpacePanActive(false);
    setShiftSelectionActive(false);
    setShiftSelectionDragging(false);
  }, [accessibilityPermissionOpen, assistantProviderPreferenceOpen, isCanvasView, searchOpen, settingsOpen]);

  const hydrateProject = useCallback(
    async (result: OpenProjectResult | null) => {
      if (!result) return;
      const shouldRevealCanvas = useScatterStore.getState().project === null;
      loadedProjectPathRef.current = result.project.path;
      skipNextAutosavePathRef.current = result.project.path;
      lastSavedDocumentKeyRef.current = documentContentKey(result.project.name, result.document.nodes, result.document.edges);
      setActiveView("canvas");
      setCanvasRevealActive(shouldRevealCanvas);
      setProjectDocument(result.project, result.document);
      setStatus(t("app.openedProject", { name: result.project.name }));
      await Promise.all([refreshRecentProjects(), refreshAchievements({ notify: true })]);
    },
    [refreshAchievements, refreshRecentProjects, setProjectDocument, setStatus, t]
  );

  const createProject = useCallback(() => {
    void window.scatter.createProject().then(hydrateProject);
  }, [hydrateProject]);

  const openRecentProject = useCallback(
    async (projectPath: string) => {
      const recentProject = recentProjects.find((item) => item.path === projectPath);
      if (recentProject?.missing) {
        setStatus(t("status.projectMissing"));
        return;
      }

      try {
        await hydrateProject(await window.scatter.openKnownProject(projectPath));
      } catch (error) {
        await refreshRecentProjects();
        setStatus(error instanceof Error ? error.message : t("status.projectMissing"));
      }
    },
    [hydrateProject, recentProjects, refreshRecentProjects, setStatus, t]
  );

  const openAchievements = useCallback((): void => {
    setActiveView("achievements");
    setDrawer(null);
  }, [setDrawer]);

  const viewAchievementToast = useCallback((): void => {
    openAchievements();
    closeAchievementToast();
  }, [closeAchievementToast, openAchievements]);

  const saveDocumentSnapshot = useCallback(async (targetProject: ScatterProjectInfo, document: ScatterDocument) => {
    if (loadedProjectPathRef.current !== targetProject.path) return;
    if (useScatterStore.getState().project?.path !== targetProject.path) return;

    setSaving(true);
    try {
      await window.scatter.saveDocument(targetProject.path, document);
      lastSavedDocumentKeyRef.current = documentContentKey(document.projectName, document.nodes, document.edges);
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
    if (skipNextAutosavePathRef.current === project.path) {
      skipNextAutosavePathRef.current = null;
      return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const document = toDocument(project.name, nodes, edges);
    const documentKey = documentContentKey(project.name, nodes, edges);
    if (documentKey === lastSavedDocumentKeyRef.current) return;
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
    if (!project || !isCanvasView) return;
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
  }, [commitCanvasChange, getVisibleCanvasCenterPosition, isCanvasView, nodes, project, selectedNode, setSelectedNodeId, t]);

  const createConnectedNode = useCallback(
    (nodeId: string, side: ConnectedNodeSide) => {
      if (!project || !isCanvasView) return;
      const sourceNode = nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;
      clearConnectionHoverTarget();

      const sourceBounds = nodeBounds(sourceNode);
      const position =
        side === "right"
          ? findOpenPositionToRight(
              {
                x: sourceNode.position.x + sourceBounds.width + TASK_NODE_HORIZONTAL_GAP,
                y: sourceNode.position.y
              },
              nodes
            )
          : findOpenPositionToLeft(
              {
                x: sourceNode.position.x - TASK_NODE_WIDTH - TASK_NODE_HORIZONTAL_GAP,
                y: sourceNode.position.y
              },
              nodes
            );
      const newNode = {
        ...emptyNode(position, nodes, t),
        selected: true
      };
      const connection =
        side === "right"
          ? { source: sourceNode.id, target: newNode.id }
          : { source: newNode.id, target: sourceNode.id };

      if (!isConnectionAllowed(connection, edges)) return;

      commitCanvasChange({
        nodes: [...nodes.map((node) => ({ ...node, selected: false })), newNode],
        edges: [...edges, { id: nanoid(), ...connection }]
      });
      setSelectedNodeId(newNode.id);
    },
    [clearConnectionHoverTarget, commitCanvasChange, edges, isCanvasView, nodes, project, setSelectedNodeId, t]
  );

  const chooseFilesForNode = useCallback(
    async (nodeId: string) => {
      if (!project) return;

      try {
        const saved = await window.scatter.chooseAttachments(project.path);
        if (!saved.length) return;
        appendAttachments(nodeId, saved);
        setStatus(t("status.attachmentsAdded", { count: saved.length }));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t("status.addAttachmentFailed"));
      }
    },
    [appendAttachments, project, setStatus, t]
  );

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
      if (isWindows) {
        try {
          await navigator.clipboard.writeText(result.markdown);
          setStatus(t("status.manualRunnerCopied"));
        } catch {
          setStatus(t("status.manualRunnerCopyFailed"));
        }
        return;
      }
      if (assistantRunInFlightRef.current) {
        setStatus(t("status.sendingAssistant"));
        return;
      }
      if (!(await ensureAccessibilityPermission())) {
        return;
      }
      const threadName = mode === "flow" ? `Scatter Flow: ${node.data.title || t("drawer.unnamedTask")}` : `Scatter: ${node.data.title || t("drawer.unnamedTask")}`;
      assistantRunInFlightRef.current = true;
      setStatus(t("status.sendingAssistant"));
      try {
        const runResult = await window.scatter.runAssistant({
          provider: assistantProvider,
          projectPath: project.path,
          threadName,
          markdown: result.markdown,
          imagePaths: result.imagePaths,
          effort: node.data.effort || "xhigh",
          planMode: result.planMode
        });
        markNodeRun(nodeId, mode);
        if (runResult.provider === "codex") {
          await refreshAchievements({ notify: true });
        }
        setStatus(t("status.sentAssistant"));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t("status.sendAssistantFailed"));
      } finally {
        assistantRunInFlightRef.current = false;
      }
    },
    [assistantProvider, edges, ensureAccessibilityPermission, isWindows, language, markNodeRun, nodes, project, refreshAchievements, setStatus, t]
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
      const nextNodes = nodes.filter((node) => node.id !== nodeId);
      const nextEdges = edgesForExistingNodes(edges, nextNodes);
      clearConnectionHoverTarget();
      commitCanvasChange({
        nodes: nextNodes,
        edges: nextEdges
      });
      setSelectedEdgeIds((current) => current.filter((edgeId) => nextEdges.some((edge) => edge.id === edgeId)));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [clearConnectionHoverTarget, commitCanvasChange, edges, nodes, selectedNodeId, setSelectedNodeId]
  );

  const deleteSelectedEdges = useCallback(() => {
    if (!selectedEdgeIds.length) return;

    const selectedEdgeIdSet = new Set(selectedEdgeIds);
    commitCanvasChange({
      edges: edges.filter((edge) => !selectedEdgeIdSet.has(edge.id))
    });
    setSelectedEdgeIds([]);
  }, [commitCanvasChange, edges, selectedEdgeIds]);

  useEffect(() => {
    setTaskNodeActions({
      updateNodeData,
      beginNodeEdit: beginHistoryTransaction,
      commitNodeEdit: commitHistoryTransaction,
      chooseFilesForNode,
      addFilesToNode,
      removeAttachment,
      createConnectedNode,
      duplicateNode,
      deleteNode,
      runNode
    });
  }, [addFilesToNode, beginHistoryTransaction, chooseFilesForNode, commitHistoryTransaction, createConnectedNode, deleteNode, duplicateNode, removeAttachment, runNode, updateNodeData]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ScatterNode>[]) => {
      const next = applyNodeChanges(changes as NodeChange[], nodes as Node<ScatterNodeData>[]) as Node<ScatterNodeData>[];
      const nextNodes = next.map((node) => ({ ...node, type: "task" as const })) as ScatterNode[];
      const hasStructuralChange = changes.some((change) => change.type === "add" || change.type === "remove" || change.type === "replace");
      const hasPositionChange = changes.some((change) => change.type === "position");
      const hasDraggingPosition = changes.some((change) => change.type === "position" && change.dragging);
      const removedNodeIds = changes.flatMap((change) => (change.type === "remove" ? [change.id] : []));

      if (hasStructuralChange) {
        clearConnectionHoverTarget();
        commitCanvasChange({
          nodes: nextNodes,
          edges: removedNodeIds.length ? edgesForExistingNodes(edges, nextNodes) : edges
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

      if (!scatterNodesEqualForLive(nodes, nextNodes)) {
        replaceCanvasLive({ nodes: nextNodes });
      }
    },
    [beginHistoryTransaction, clearConnectionHoverTarget, commitCanvasChange, commitHistoryTransaction, edges, nodes, replaceCanvasLive, setSelectedNodeId]
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

      if (shiftSelectionActive) {
        setSelectedEdgeIds((current) => (current.length ? [] : current));
        return;
      }

      const nextSelectedEdgeIds = next.filter((edge) => Boolean(edge.selected)).map((edge) => edge.id);
      setSelectedEdgeIds((current) => (stringArraysEqual(current, nextSelectedEdgeIds) ? current : nextSelectedEdgeIds));
      if (!scatterEdgesEqual(edges, nextEdges)) {
        replaceCanvasLive({ edges: nextEdges });
      }
    },
    [commitCanvasChange, edges, replaceCanvasLive, shiftSelectionActive]
  );

  const commitExistingConnection = useCallback(
    (connection: Pick<ScatterEdge, "source" | "target">, selectedNodeIdAfterCommit: string) => {
      if (!isConnectionAllowed(connection, edges)) return false;

      commitCanvasChange({
        nodes: nodes.map((node) => ({ ...node, selected: node.id === selectedNodeIdAfterCommit })),
        edges: [...edges, { id: nanoid(), source: connection.source, target: connection.target }]
      });
      setSelectedNodeId(selectedNodeIdAfterCommit);
      return true;
    },
    [commitCanvasChange, edges, nodes, setSelectedNodeId]
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      return isConnectionAllowed({ source: connection.source, target: connection.target }, edges);
    },
    [edges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const didCommit = commitExistingConnection({ source: connection.source, target: connection.target }, connection.target);
      connectionSucceededRef.current = didCommit;
      if (didCommit) clearConnectionHoverTarget();
    },
    [clearConnectionHoverTarget, commitExistingConnection]
  );

  const handleConnectStart = useCallback<OnConnectStart>(
    (_event, params) => {
      setIsConnecting(true);
      connectionSucceededRef.current = false;
      clearConnectionHoverTarget();

      if (!params.nodeId || !params.handleType) {
        connectionStartRef.current = null;
        return;
      }

      const hasExistingParent = params.handleType === "target" && edges.some((edge) => edge.target === params.nodeId);
      if (hasExistingParent) {
        connectionStartRef.current = null;
        return;
      }

      connectionStartRef.current = {
        nodeId: params.nodeId,
        handleType: params.handleType
      };
      setSelectedNodeId(params.nodeId);
      replaceCanvasLive({ nodes: nodes.map((node) => ({ ...node, selected: node.id === params.nodeId })) });
    },
    [clearConnectionHoverTarget, edges, nodes, replaceCanvasLive, setSelectedNodeId]
  );

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      setIsConnecting(false);

      const connectionStart = connectionStartRef.current;
      const connectedSuccessfully = connectionSucceededRef.current || connectionState.isValid === true;
      const hoveredNodeId = connectionHoverTargetRef.current?.hoveredNodeId ?? nodeIdFromConnectionEvent(event);
      connectionStartRef.current = null;
      connectionSucceededRef.current = false;
      clearConnectionHoverTarget();

      if (connectedSuccessfully || !project || !isCanvasView || !connectionStart) return;

      if (hoveredNodeId) {
        const hoveredConnection = connectionFromStart(connectionStart, hoveredNodeId);
        if (hoveredConnection) {
          commitExistingConnection(hoveredConnection, hoveredNodeId);
        }
        return;
      }

      if (connectionState.toHandle || connectionState.toNode) return;

      const clientPosition = eventClientPosition(event);
      const canvasRect = canvasShellRef.current?.getBoundingClientRect();
      if (!clientPosition || !canvasRect) return;
      const isInsideCanvas =
        clientPosition.x >= canvasRect.left &&
        clientPosition.x <= canvasRect.right &&
        clientPosition.y >= canvasRect.top &&
        clientPosition.y <= canvasRect.bottom;
      if (!isInsideCanvas) return;

      const flowPosition = flowInstanceRef.current?.screenToFlowPosition(clientPosition);
      if (!flowPosition) return;

      const sourceNode = nodes.find((node) => node.id === connectionStart.nodeId);
      if (!sourceNode) return;

      const nodePosition = findConnectionDropPosition(flowPosition, connectionStart.handleType, sourceNode, nodes);
      const newNode = {
        ...emptyNode(nodePosition, nodes, t),
        selected: true
      };
      const newEdge =
        connectionStart.handleType === "source"
          ? { id: nanoid(), source: sourceNode.id, target: newNode.id }
          : { id: nanoid(), source: newNode.id, target: sourceNode.id };

      commitCanvasChange({
        nodes: [...nodes.map((node) => ({ ...node, selected: false })), newNode],
        edges: [...edges, newEdge]
      });
      setSelectedNodeId(newNode.id);
    },
    [clearConnectionHoverTarget, commitCanvasChange, commitExistingConnection, edges, isCanvasView, nodes, project, setSelectedNodeId, t]
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
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (connectionStartRef.current) return;
      const selectedNodeIds = selectedNodes.map((node) => node.id);
      const nextSelectedNodeId =
        selectedNodeId && selectedNodeIds.includes(selectedNodeId) ? selectedNodeId : selectedNodeIds[0] || null;
      if (nextSelectedNodeId !== selectedNodeId) {
        selectCanvasNode(nextSelectedNodeId);
      }
      if (shiftSelectionActive) {
        setSelectedEdgeIds((current) => (current.length ? [] : current));
        return;
      }
      const nextSelectedEdgeIds = selectedEdges.map((edge) => edge.id);
      setSelectedEdgeIds((current) => (stringArraysEqual(current, nextSelectedEdgeIds) ? current : nextSelectedEdgeIds));
    },
    [selectCanvasNode, selectedNodeId, shiftSelectionActive]
  );

  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);

      const connectionStart = connectionStartRef.current;
      if (!connectionStart) return;

      const hoverConnection = connectionFromStart(connectionStart, node.id);
      if (!hoverConnection || !isConnectionAllowed(hoverConnection, edges)) {
        clearConnectionHoverTarget();
        return;
      }

      updateConnectionHoverTarget({
        sourceId: hoverConnection.source,
        targetId: hoverConnection.target,
        hoveredNodeId: node.id
      });
    },
    [clearConnectionHoverTarget, edges, updateConnectionHoverTarget]
  );

  const handleNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setHoveredNodeId(null);
      if (connectionHoverTargetRef.current?.hoveredNodeId === node.id) {
        clearConnectionHoverTarget();
      }
    },
    [clearConnectionHoverTarget]
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      if (!project || !isCanvasView || assistantProviderPreferenceOpen || accessibilityPermissionOpen || settingsOpen || searchOpen) return;

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
      accessibilityPermissionOpen,
      assistantProviderPreferenceOpen,
      beginHistoryTransaction,
      cancelHistoryTransaction,
      commitHistoryTransaction,
      ensureTargetNode,
      isCanvasView,
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
      if (
        !project ||
        !isCanvasView ||
        assistantProviderPreferenceOpen ||
        accessibilityPermissionOpen ||
        settingsOpen ||
        searchOpen ||
        event.dataTransfer.files.length === 0
      ) {
        return;
      }
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
    [accessibilityPermissionOpen, addFilesToNode, assistantProviderPreferenceOpen, beginHistoryTransaction, cancelHistoryTransaction, commitHistoryTransaction, ensureTargetNode, isCanvasView, project, searchOpen, settingsOpen, setStatus, t]
  );

  const runActiveNode = useCallback(() => {
    if (!isCanvasView) return;
    if (!selectedNode) return;
    setTaskRunModeOverride({ nodeId: selectedNode.id, mode: "flow" });
    void runNode(selectedNode.id, "flow");
  }, [isCanvasView, runNode, selectedNode]);

  const fitCanvas = useCallback(() => {
    if (!isCanvasView) return;
    flowInstanceRef.current?.fitView({ padding: 0.24 });
  }, [isCanvasView]);

  const handleMove = useCallback<OnMove>((_event, viewport) => {
    setViewportZoom(viewport.zoom);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button === 0 && shiftSelectionActive && !panModeActive) {
        setShiftSelectionDragging(true);
      }
    },
    [panModeActive, shiftSelectionActive]
  );

  const toggleTasksDrawer = useCallback(() => {
    if (!project || !isCanvasView) return;
    setDrawer(drawer === "tasks" ? null : "tasks");
  }, [drawer, isCanvasView, project, setDrawer]);

  const toggleMarkdownDrawer = useCallback(() => {
    if (!project || !isCanvasView || !selectedNode) return;
    setDrawer(drawer === "markdown" ? null : "markdown");
  }, [drawer, isCanvasView, project, selectedNode, setDrawer]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (assistantProviderPreferenceOpen || accessibilityPermissionOpen || settingsOpen || searchOpen || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;

      if (hasPrimaryModifier && !event.altKey) {
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

        if (!isCanvasView) return;

        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
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

      if (!isCanvasView) return;

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

      if (event.key !== "Backspace" && event.key !== "Delete") return;

      if (selectedEdgeIds.length) {
        event.preventDefault();
        deleteSelectedEdges();
        return;
      }

      if (!selectedNodeId) return;

      event.preventDefault();
      deleteNode(selectedNodeId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accessibilityPermissionOpen,
    addNode,
    assistantProviderPreferenceOpen,
    createProject,
    deleteNode,
    deleteSelectedEdges,
    fitCanvas,
    isCanvasView,
    openSettingsDialog,
    project,
    redo,
    runActiveNode,
    searchOpen,
    selectedEdgeIds,
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
              <p className="startup-status">{t("startup.version", { version: appVersion })}</p>
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
        activePath={isCanvasView ? project?.path : undefined}
        achievementsActive={isAchievementsView}
        collapsed={sidebarCollapsed}
        onCreateProject={createProject}
        onOpenAchievements={openAchievements}
        onOpenRecent={(projectPath) => void openRecentProject(projectPath)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={openSettingsDialog}
        onRemoveRecent={(projectPath) => void removeRecentProject(projectPath)}
        onReorderRecent={(projectPaths) => void reorderRecentProjects(projectPaths)}
      />
      <section className="workspace">
        <Topbar
          activeDrawer={isCanvasView ? drawer : null}
          canOpenMarkdown={isCanvasView && Boolean(selectedNode)}
          canRun={isCanvasView && Boolean(selectedNode)}
          sidebarCollapsed={sidebarCollapsed}
          updateState={updateState}
          disabled={!project || !isCanvasView}
          onCreateProject={createProject}
          onUpdate={() => void runTopbarUpdateAction()}
          onRunActive={runActiveNode}
          onOpenTasks={toggleTasksDrawer}
          onOpenMarkdown={toggleMarkdownDrawer}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <div
          className={`workspace-content ${isCanvasView && drawer ? "has-right-sidebar" : ""} ${isCanvasView && drawer === "markdown" ? "has-markdown-sidebar" : ""} ${isCanvasView && isResizingMarkdownPanel ? "is-resizing-markdown" : ""}`}
          ref={workspaceContentRef}
          style={
            isCanvasView && drawer === "markdown"
              ? ({
                  "--markdown-panel-ratio": markdownPanelRatio,
                  "--canvas-panel-ratio": 1 - markdownPanelRatio
                } as CSSProperties)
              : undefined
          }
        >
          {isAchievementsView ? (
            <AchievementsWall achievementState={achievementState} />
          ) : project ? (
            <>
              <div
                className={`canvas-shell ${canvasRevealActive ? "is-revealing" : ""} ${isConnecting ? "is-connecting" : ""} ${connectionPreview ? "has-connection-preview" : ""} ${shiftSelectionDragging ? "is-shift-selecting" : ""}`}
                ref={canvasShellRef}
                onPointerDown={handleCanvasPointerDown}
                onAnimationEnd={(event) => {
                  if (event.animationName === "canvas-project-reveal") setCanvasRevealActive(false);
                }}
              >
                <ReactFlow
                  nodes={nodes as Node[]}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  connectionLineComponent={ScatterConnectionLine}
                  onNodesChange={onNodesChange as any}
                  onEdgesChange={onEdgesChange as any}
                  onConnect={onConnect}
                  onSelectionChange={onSelectionChange}
                  selectionKeyCode={null}
                  selectionOnDrag={shiftSelectionActive && !panModeActive}
                  panOnDrag={panModeActive}
                  panActivationKeyCode={null}
                  panOnScroll
                  panOnScrollMode={PanOnScrollMode.Free}
                  zoomOnScroll={false}
                  zoomOnPinch
                  zoomOnDoubleClick={false}
                  zoomActivationKeyCode="Meta"
                  nodesDraggable={!panModeActive && !shiftSelectionActive}
                  disableKeyboardA11y
                  onConnectStart={handleConnectStart}
                  onConnectEnd={handleConnectEnd}
                  onNodeMouseEnter={handleNodeMouseEnter}
                  onNodeMouseLeave={handleNodeMouseLeave}
                  onNodeDragStart={handleNodeDragStart}
                  onNodeDragStop={handleNodeDragStop}
                  connectOnClick={false}
                  isValidConnection={isValidConnection}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance;
                  }}
                  onMove={handleMove}
                  fitView
                  deleteKeyCode={null}
                  minZoom={0.2}
                  maxZoom={2}
                  proOptions={proOptions}
                  defaultEdgeOptions={defaultEdgeOptions}
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
        assistantProvider={assistantProvider}
        assistantProviderOnboardingCompleted={assistantProviderOnboardingCompleted}
        showTranslucentBackground={!isWindows}
        onOpenChange={handleSettingsOpenChange}
        onPreview={applySettingsValues}
        onSave={handleSaveSettings}
      />
      <AssistantProviderPreferenceDialog
        assistantProvider={assistantProvider}
        open={assistantProviderPreferenceOpen}
        onDismiss={dismissAssistantProviderPreference}
        onSave={saveAssistantProviderPreference}
      />
      <AccessibilityPermissionDialog
        open={supportsMacAutomation && accessibilityPermissionOpen && accessibilityTrusted !== true}
        onDismiss={dismissAccessibilityPermission}
        onOpenGuide={openAccessibilityGuide}
      />
      <SearchDialog
        open={searchOpen}
        projects={recentProjects}
        onOpenChange={setSearchOpen}
        onOpenProject={(projectPath) => void openRecentProject(projectPath)}
      />
      {achievementToastQueue[0] ? (
        <AchievementToast achievement={achievementToastQueue[0]} onClose={closeAchievementToast} onView={viewAchievementToast} />
      ) : null}
      </main>
    </I18nProvider>
  );
}

export default App;
