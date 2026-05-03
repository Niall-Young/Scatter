import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
  OpenProjectResult,
  RunMode,
  ScatterDocument,
  ScatterEdge,
  ScatterNode,
  ScatterNodeData,
  ScatterProjectInfo
} from "../../shared/types";
import { buildMarkdown } from "./lib/markdown";
import { Sidebar } from "./components/Sidebar";
import { ScatterEdge as ScatterFlowEdge } from "./components/ScatterEdge";
import { Topbar } from "./components/Topbar";
import { RightDrawer } from "./components/RightDrawer";
import { TaskNode, setTaskNodeActions } from "./components/TaskNode";
import { DropdownMenu, DropdownMenuItem } from "./components/ui/dropdown-menu";
import { Icon } from "./components/ui/icon";
import { useScatterStore } from "./store/scatterStore";
import startupToolboxImage from "./assets/startup-toolbox.png";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";

const nodeTypes = { task: TaskNode } satisfies NodeTypes;
const edgeTypes = { scatter: ScatterFlowEdge } satisfies EdgeTypes;
const TASK_NODE_WIDTH = 400;
const TASK_NODE_HEIGHT = 220;
const TASK_NODE_HORIZONTAL_GAP = 180;
const TASK_NODE_VERTICAL_GAP = 72;
const zoomOptions = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 }
];

type FlowPosition = { x: number; y: number };
type CanvasTool = "select" | "pan";

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

function defaultTaskTitle(nodes: ScatterNode[]): string {
  const nextNumber =
    nodes.reduce((max, node) => {
      const match = /^新建任务\s+(\d+)$/.exec(node.data.title.trim());
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `新建任务 ${nextNumber}`;
}

function emptyNode(position: { x: number; y: number }, existingNodes: ScatterNode[]): ScatterNode {
  return {
    id: nanoid(),
    type: "task",
    position,
    data: {
      title: defaultTaskTitle(existingNodes),
      body: "",
      attachments: [],
      effort: "xhigh",
      planMode: false,
      runMode: "flow"
    }
  };
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("select");
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(1);
  const isSplashWindow = new URLSearchParams(window.location.search).get("window") === "splash";
  const saveTimerRef = useRef<number | null>(null);
  const loadedProjectPathRef = useRef<string | null>(null);
  const latestMouseRef = useRef({ x: 360, y: 240 });
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const nodeDragHistoryOpenRef = useRef(false);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedRunMode = selectedNode?.data.runMode || "flow";
  const panModeActive = canvasTool === "pan" || spacePanActive;
  const zoomPercent = Math.round(viewportZoom * 100);
  const markdownResult = useMemo(
    () =>
      project
        ? buildMarkdown(nodes, edges, selectedNodeId, selectedRunMode, project.name, project.path)
        : {
            markdown: "",
            nodes: [],
            attachments: [],
            imagePaths: [],
            planMode: false,
            hasCycle: false
          },
    [edges, nodes, project, selectedNodeId, selectedRunMode]
  );

  const refreshRecentProjects = useCallback(async () => {
    setRecentProjects(await window.scatter.getRecentProjects());
  }, []);

  useEffect(() => {
    if (!isSplashWindow) {
      void refreshRecentProjects();
    }
  }, [isSplashWindow, refreshRecentProjects]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.window = isSplashWindow ? "splash" : "main";
  }, [isSplashWindow, theme]);

  useEffect(() => {
    function isSpaceKey(event: KeyboardEvent): boolean {
      return event.code === "Space" || event.key === " ";
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!isSpaceKey(event) || isEditableTarget(event.target)) return;
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
  }, []);

  const hydrateProject = useCallback(
    async (result: OpenProjectResult | null) => {
      if (!result) return;
      loadedProjectPathRef.current = result.project.path;
      setProjectDocument(result.project, result.document);
      await refreshRecentProjects();
    },
    [refreshRecentProjects, setProjectDocument]
  );

  const createProject = useCallback(() => {
    void window.scatter.createProject().then(hydrateProject);
  }, [hydrateProject]);

  const saveCurrentDocument = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    try {
      const document = toDocument(project.name, nodes, edges);
      await window.scatter.saveDocument(project.path, document);
      setStatus("已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [edges, nodes, project, setSaving, setStatus]);

  useEffect(() => {
    if (!project || loadedProjectPathRef.current !== project.path) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveCurrentDocument();
    }, 550);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [nodes, edges, project, saveCurrentDocument]);

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
    const node = emptyNode(position, nodes);
    commitCanvasChange({ nodes: [...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }] });
    setSelectedNodeId(node.id);
  }, [commitCanvasChange, getVisibleCanvasCenterPosition, nodes, project, selectedNode, setSelectedNodeId]);

  const addFilesToNode = useCallback(
    async (nodeId: string, files: FileList | File[], source: "upload" | "drop" | "paste") => {
      if (!project) return;
      const inputs = await filesToInputs(files, source);
      if (!inputs.length) return;
      const saved = await window.scatter.saveAttachments(project.path, inputs);
      appendAttachments(nodeId, saved);
      setStatus(`已添加 ${saved.length} 个附件`);
    },
    [appendAttachments, project, setStatus]
  );

  const ensureTargetNode = useCallback((): ScatterNode | null => {
    if (!project) return null;
    const existing = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
    if (existing) return existing;
    const node = emptyNode(findOpenPositionNear(getVisibleCanvasCenterPosition(), nodes), nodes);
    replaceCanvasLive({ nodes: [...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }] });
    setSelectedNodeId(node.id);
    return node;
  }, [getVisibleCanvasCenterPosition, nodes, project, replaceCanvasLive, selectedNodeId, setSelectedNodeId]);

  const runNode = useCallback(
    async (nodeId: string, mode: RunMode) => {
      if (!project) return;
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const result = buildMarkdown(nodes, edges, nodeId, mode, project.name, project.path);
      const threadName = mode === "flow" ? `Scatter Flow: ${node.data.title || "Untitled"}` : `Scatter: ${node.data.title || "Untitled"}`;
      setStatus("正在发送到 Codex...");
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
        setStatus("已发送到 Codex");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "发送到 Codex 失败");
      }
    },
    [edges, markNodeRun, nodes, project, setStatus]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((node) => node.id === nodeId);
      if (!source) return;
      const duplicate: ScatterNode = {
        ...source,
        id: nanoid(),
        selected: true,
        position: {
          x: source.position.x + 32,
          y: source.position.y + 32
        },
        data: {
          ...source.data,
          title: defaultTaskTitle(nodes)
        }
      };
      commitCanvasChange({ nodes: [...nodes.map((node) => ({ ...node, selected: false })), duplicate] });
      setSelectedNodeId(duplicate.id);
    },
    [commitCanvasChange, nodes, setSelectedNodeId]
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
    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.metaKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (!selectedNodeId || (event.key !== "Backspace" && event.key !== "Delete")) return;

      event.preventDefault();
      deleteNode(selectedNodeId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteNode, redo, selectedNodeId, undo]);

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
        if (hasDraggingPosition) {
          if (!nodeDragHistoryOpenRef.current) {
            beginHistoryTransaction();
            nodeDragHistoryOpenRef.current = true;
          }
          replaceCanvasLive({ nodes: nextNodes });
          return;
        }

        if (nodeDragHistoryOpenRef.current) {
          replaceCanvasLive({ nodes: nextNodes });
          commitHistoryTransaction();
          nodeDragHistoryOpenRef.current = false;
          return;
        }

        commitCanvasChange({ nodes: nextNodes });
        return;
      }

      replaceCanvasLive({ nodes: nextNodes });
    },
    [beginHistoryTransaction, commitCanvasChange, commitHistoryTransaction, edges, nodes, replaceCanvasLive]
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
      if (!project) return;

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
          setStatus(error instanceof Error ? error.message : "添加附件失败");
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
      setStatus,
      updateNodeData
    ]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      if (!project || event.dataTransfer.files.length === 0) return;
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
        setStatus(error instanceof Error ? error.message : "添加附件失败");
      }
    },
    [addFilesToNode, beginHistoryTransaction, cancelHistoryTransaction, commitHistoryTransaction, ensureTargetNode, project, setStatus]
  );

  const runActiveNode = useCallback(() => {
    const target = selectedNode || nodes[0];
    if (!target) return;
    void runNode(target.id, target.data.runMode || "flow");
  }, [nodes, runNode, selectedNode]);

  if (isSplashWindow) {
    return (
      <main className="startup-shell" data-theme={theme}>
        <section className="startup-panel" aria-label="Scatter 启动中">
          <div className="startup-copy">
            <div className="startup-title-group">
              <h1>Scatter</h1>
              <p>构建你的项目，然后再执行</p>
            </div>
            <p className="startup-status">启动中....</p>
          </div>
          <div className="startup-visual" aria-hidden="true">
            <div className="startup-image-frame">
              <img src={startupToolboxImage} alt="" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
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
        theme={theme}
        onCreateProject={createProject}
        onOpenProject={() => window.scatter.openProject().then(hydrateProject)}
        onOpenRecent={(projectPath) => window.scatter.openKnownProject(projectPath).then(hydrateProject)}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />
      <section className="workspace">
        <Topbar
          activeDrawer={drawer}
          canRun={nodes.length > 0}
          sidebarCollapsed={sidebarCollapsed}
          disabled={!project}
          onCreateProject={createProject}
          onRunActive={runActiveNode}
          onOpenTasks={() => {
            if (project) setDrawer(drawer === "tasks" ? null : "tasks");
          }}
          onOpenMarkdown={() => {
            if (project) setDrawer(drawer === "markdown" ? null : "markdown");
          }}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
        <div className={`workspace-content ${drawer ? "has-right-sidebar" : ""}`}>
          {project ? (
            <>
              <div className="canvas-shell" ref={canvasShellRef}>
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
                  onNodeDragStop={() => {
                    window.setTimeout(() => {
                      if (!nodeDragHistoryOpenRef.current) return;
                      commitHistoryTransaction();
                      nodeDragHistoryOpenRef.current = false;
                    }, 0);
                  }}
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
                <div className="canvas-actions" aria-label="画布操作">
                  <button className="canvas-tool-button" type="button" aria-label="定位画布" onClick={() => flowInstanceRef.current?.fitView({ padding: 0.24 })}>
                    <Icon name="map-pin" size={16} />
                  </button>
                  <button className="canvas-tool-button" type="button" aria-label="撤销" title="撤销 (Cmd+Z)" disabled={!canUndo} onClick={undo}>
                    <Icon name="undo" size={16} />
                  </button>
                  <button className="canvas-tool-button" type="button" aria-label="重做" title="重做 (Cmd+Shift+Z)" disabled={!canRedo} onClick={redo}>
                    <Icon name="redo" size={16} />
                  </button>
                </div>
                <div className="canvas-toolbar" aria-label="画布工具">
                  <button className="canvas-toolbar-button" type="button" aria-label="新建节点" onClick={addNode}>
                    <Icon name="plus-lg" size={20} />
                  </button>
                  <span className="canvas-toolbar-divider" />
                  <button
                    className={`canvas-toolbar-button ${canvasTool === "select" && !spacePanActive ? "is-selected" : ""}`}
                    type="button"
                    aria-label="选择工具"
                    aria-pressed={canvasTool === "select" && !spacePanActive}
                    onClick={() => setCanvasTool("select")}
                  >
                    <Icon name="work-with-apps" size={20} />
                  </button>
                  <button
                    className={`canvas-toolbar-button ${panModeActive ? "is-selected" : ""}`}
                    type="button"
                    aria-label="拖动画布"
                    aria-pressed={panModeActive}
                    onClick={() => setCanvasTool("pan")}
                  >
                    <Icon name="hand-raised" size={20} />
                  </button>
                  <span className="canvas-toolbar-divider" />
                  <RadixDropdownMenu.Root>
                    <RadixDropdownMenu.Trigger asChild>
                      <button className="canvas-zoom-trigger" type="button" aria-label="缩放比例">
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
                </div>
              </div>
              <RightDrawer
                drawer={drawer}
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                markdown={markdownResult.markdown}
                currentRunMode={selectedRunMode}
                onPreviewNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  replaceCanvasLive({ nodes: nodes.map((node) => ({ ...node, selected: node.id === nodeId })) });
                  setDrawer("markdown");
                }}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  replaceCanvasLive({ nodes: nodes.map((node) => ({ ...node, selected: node.id === nodeId })) });
                }}
                onRunNode={runNode}
              />
            </>
          ) : (
            <div className="empty-workspace" aria-label="未打开项目" />
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
