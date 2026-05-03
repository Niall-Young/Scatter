import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
import { Button } from "./components/ui/button";
import { Icon } from "./components/ui/icon";
import { useScatterStore } from "./store/scatterStore";
import "@xyflow/react/dist/style.css";
import "./styles/app.css";

const nodeTypes = { task: TaskNode } satisfies NodeTypes;
const edgeTypes = { scatter: ScatterFlowEdge } satisfies EdgeTypes;
const TASK_NODE_WIDTH = 400;
const TASK_NODE_HEIGHT = 220;
const TASK_NODE_HORIZONTAL_GAP = 180;
const TASK_NODE_VERTICAL_GAP = 72;

type FlowPosition = { x: number; y: number };

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

function App(): ReactElement {
  const {
    project,
    nodes,
    edges,
    selectedNodeId,
    drawer,
    theme,
    setProjectDocument,
    setNodes,
    setEdges,
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const loadedProjectPathRef = useRef<string | null>(null);
  const latestMouseRef = useRef({ x: 360, y: 240 });
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedRunMode = selectedNode?.data.runMode || "flow";
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
    refreshRecentProjects();
  }, [refreshRecentProjects]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const hydrateProject = useCallback(
    async (result: OpenProjectResult | null) => {
      if (!result) return;
      loadedProjectPathRef.current = result.project.path;
      setProjectDocument(result.project, result.document);
      await refreshRecentProjects();
    },
    [refreshRecentProjects, setProjectDocument]
  );

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
    setNodes([...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }]);
    setSelectedNodeId(node.id);
  }, [getVisibleCanvasCenterPosition, nodes, project, selectedNode, setNodes, setSelectedNodeId]);

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

  const ensureTargetNode = useCallback(async (): Promise<ScatterNode | null> => {
    if (!project) return null;
    const existing = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
    if (existing) return existing;
    const node = emptyNode(findOpenPositionNear(getVisibleCanvasCenterPosition(), nodes), nodes);
    setNodes([...nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }]);
    setSelectedNodeId(node.id);
    return node;
  }, [getVisibleCanvasCenterPosition, nodes, project, selectedNodeId, setNodes, setSelectedNodeId]);

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
      setNodes([...nodes.map((node) => ({ ...node, selected: false })), duplicate]);
      setSelectedNodeId(duplicate.id);
    },
    [nodes, setNodes, setSelectedNodeId]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes(nodes.filter((node) => node.id !== nodeId));
      setEdges(edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [edges, nodes, selectedNodeId, setEdges, setNodes, setSelectedNodeId]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!selectedNodeId || (event.key !== "Backspace" && event.key !== "Delete")) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      deleteNode(selectedNodeId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteNode, selectedNodeId]);

  useEffect(() => {
    setTaskNodeActions({
      updateNodeData,
      addFilesToNode,
      removeAttachment,
      duplicateNode,
      deleteNode,
      runNode
    });
  }, [addFilesToNode, deleteNode, duplicateNode, removeAttachment, runNode, updateNodeData]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ScatterNode>[]) => {
      const next = applyNodeChanges(changes as NodeChange[], nodes as Node<ScatterNodeData>[]) as Node<ScatterNodeData>[];
      setNodes(next.map((node) => ({ ...node, type: "task" as const })) as ScatterNode[]);
    },
    [nodes, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ScatterEdge>[]) => {
      const next = applyEdgeChanges(changes as EdgeChange[], edges as Edge[]);
      setEdges(
        next.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: typeof (edge as Edge).label === "string" ? ((edge as Edge).label as string) : undefined
        }))
      );
    },
    [edges, setEdges]
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
      setEdges(next.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })));
    },
    [edges, setEdges]
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
        setNodes(nodes.map((item) => ({ ...item, selected: item.id === node.id })));
      }
    },
    [isConnecting, nodes, selectCanvasNode, setNodes]
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      if (!project) return;
      const target = await ensureTargetNode();
      if (!target) return;

      const files = event.clipboardData.files;
      if (files.length > 0) {
        event.preventDefault();
        await addFilesToNode(target.id, files, "paste");
        return;
      }

      const text = event.clipboardData.getData("text/plain");
      const savedImage = await window.scatter.saveClipboardImage(project.path);
      if (savedImage) {
        event.preventDefault();
        appendAttachments(target.id, [savedImage]);
        return;
      }

      const savedFiles = await window.scatter.saveClipboardFiles(project.path);
      if (savedFiles.length) {
        event.preventDefault();
        appendAttachments(target.id, savedFiles);
        return;
      }

      if (text && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        updateNodeData(target.id, {
          body: `${target.data.body ? `${target.data.body}\n` : ""}${text}`
        });
      }
    },
    [addFilesToNode, appendAttachments, ensureTargetNode, project, updateNodeData]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      if (!project || event.dataTransfer.files.length === 0) return;
      event.preventDefault();
      const target = await ensureTargetNode();
      if (!target) return;
      await addFilesToNode(target.id, event.dataTransfer.files, "drop");
    },
    [addFilesToNode, ensureTargetNode, project]
  );

  const runActiveNode = useCallback(() => {
    const target = selectedNode || nodes[0];
    if (!target) return;
    void runNode(target.id, target.data.runMode || "flow");
  }, [nodes, runNode, selectedNode]);

  if (!project) {
    return (
      <main className="welcome-shell" data-theme={theme}>
        <div className="welcome-card">
          <div className="welcome-icon">
            <Icon name="inbox" size={24} />
          </div>
          <h1>Scatter</h1>
          <p>选择一个本地文件夹作为项目，然后开始组织多模态任务画布。</p>
          <div className="welcome-actions">
            <Button variant="primary" onClick={() => hydrateProject(null).then(() => window.scatter.createProject().then(hydrateProject))}>
              新建项目文件夹
            </Button>
            <Button onClick={() => window.scatter.openProject().then(hydrateProject)}>打开项目文件夹</Button>
          </div>
          <div className="welcome-recent">
            {recentProjects.map((item) => (
              <button key={item.path} type="button" onClick={() => window.scatter.openKnownProject(item.path).then(hydrateProject)}>
                <strong>{item.name}</strong>
                <span>{item.path}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="app-shell"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      onMouseMove={(event) => {
        latestMouseRef.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <Sidebar
        recentProjects={recentProjects}
        activePath={project.path}
        theme={theme}
        onCreateProject={() => window.scatter.createProject().then(hydrateProject)}
        onOpenProject={() => window.scatter.openProject().then(hydrateProject)}
        onOpenRecent={(projectPath) => window.scatter.openKnownProject(projectPath).then(hydrateProject)}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />
      <section className="workspace">
        <Topbar
          canRun={nodes.length > 0}
          onRunActive={runActiveNode}
          onOpenTasks={() => setDrawer(drawer === "tasks" ? null : "tasks")}
          onOpenMarkdown={() => setDrawer(drawer === "markdown" ? null : "markdown")}
        />
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
            onConnectStart={() => setIsConnecting(true)}
            onConnectEnd={() => setIsConnecting(false)}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
            }}
            fitView
            minZoom={0.2}
            maxZoom={1.8}
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
            <button className="canvas-tool-button" type="button" aria-label="撤销" disabled>
              <Icon name="undo" size={16} />
            </button>
            <button className="canvas-tool-button" type="button" aria-label="重做" disabled>
              <Icon name="redo" size={16} />
            </button>
          </div>
          <div className="canvas-toolbar" aria-label="画布工具">
            <button className="canvas-toolbar-button" type="button" aria-label="新建节点" onClick={addNode}>
              <Icon name="plus-lg" size={20} />
            </button>
            <span className="canvas-toolbar-divider" />
            <button className="canvas-toolbar-button is-selected" type="button" aria-label="选择工具">
              <Icon name="work-with-apps" size={20} />
            </button>
            <button className="canvas-toolbar-button" type="button" aria-label="拖动画布">
              <Icon name="hand-raised" size={20} />
            </button>
            <span className="canvas-toolbar-divider" />
            <button className="canvas-zoom-trigger" type="button" onClick={() => flowInstanceRef.current?.zoomTo(1)}>
              <span>100%</span>
              <Icon name="chevron-down" size={16} />
            </button>
          </div>
        </div>
      </section>
      <RightDrawer
        drawer={drawer}
        nodes={nodes}
        edges={edges}
        selectedNodeId={selectedNodeId}
        markdown={markdownResult.markdown}
        currentRunMode={selectedRunMode}
        onClose={() => setDrawer(null)}
        onSelectNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setNodes(nodes.map((node) => ({ ...node, selected: node.id === nodeId })));
          setDrawer("markdown");
        }}
        onRunNode={runNode}
      />
    </main>
  );
}

export default App;
