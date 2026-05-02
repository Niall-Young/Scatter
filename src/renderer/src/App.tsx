import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnSelectionChangeParams,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeTypes
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { Inbox } from "lucide-react";
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
import { Topbar } from "./components/Topbar";
import { RightDrawer } from "./components/RightDrawer";
import { TaskNode, setTaskNodeActions } from "./components/TaskNode";
import { Button } from "./components/ui/button";
import { useScatterStore } from "./store/scatterStore";
import "./styles/app.css";
import "@xyflow/react/dist/style.css";

const nodeTypes = { task: TaskNode } satisfies NodeTypes;

function emptyNode(position: { x: number; y: number }): ScatterNode {
  return {
    id: nanoid(),
    type: "task",
    position,
    data: {
      title: "新任务节点",
      body: "",
      attachments: [],
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
    status,
    isSaving,
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
    markNodeRun
  } = useScatterStore();

  const [recentProjects, setRecentProjects] = useState<ScatterProjectInfo[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const loadedProjectPathRef = useRef<string | null>(null);
  const latestMouseRef = useRef({ x: 360, y: 240 });

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

  const addNode = useCallback(() => {
    if (!project) return;
    const node = emptyNode({
      x: latestMouseRef.current.x - 280,
      y: latestMouseRef.current.y - 120
    });
    setNodes([...nodes, node]);
    setSelectedNodeId(node.id);
    setDrawer("markdown");
  }, [nodes, project, setDrawer, setNodes, setSelectedNodeId]);

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
    const node = emptyNode({
      x: latestMouseRef.current.x - 280,
      y: latestMouseRef.current.y - 120
    });
    setNodes([...nodes, node]);
    setSelectedNodeId(node.id);
    return node;
  }, [nodes, project, selectedNodeId, setNodes, setSelectedNodeId]);

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

  useEffect(() => {
    setTaskNodeActions({
      updateNodeData,
      addFilesToNode,
      runNode
    });
  }, [addFilesToNode, runNode, updateNodeData]);

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
            type: "smoothstep",
            animated: false
          },
          edges as Edge[]
      );
      setEdges(next.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })));
    },
    [edges, setEdges]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const first = selectedNodes[0] as ScatterNode | undefined;
      setSelectedNodeId(first?.id || null);
    },
    [setSelectedNodeId]
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

  const exportMarkdown = useCallback(async () => {
    if (!markdownResult.markdown) return;
    await navigator.clipboard.writeText(markdownResult.markdown);
    setStatus("Markdown 已复制到剪贴板");
  }, [markdownResult.markdown, setStatus]);

  if (!project) {
    return (
      <main className="welcome-shell" data-theme={theme}>
        <div className="welcome-card">
          <div className="welcome-icon">
            <Inbox size={24} />
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
          projectName={project.name}
          taskCount={nodes.length}
          isSaving={isSaving}
          status={status}
          onAddNode={addNode}
          onOpenTasks={() => setDrawer(drawer === "tasks" ? null : "tasks")}
          onOpenMarkdown={() => setDrawer(drawer === "markdown" ? null : "markdown")}
          onExportMarkdown={exportMarkdown}
        />
        <div className="canvas-shell">
          <ReactFlow
            nodes={nodes as Node[]}
            edges={edges as Edge[]}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange as any}
            onEdgesChange={onEdgesChange as any}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            fitView
            minZoom={0.2}
            maxZoom={1.8}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "var(--color-border-connecting)", strokeWidth: 1.6 }
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--color-border-divider)" />
            <MiniMap pannable zoomable nodeColor="var(--color-primary)" maskColor="rgba(0,0,0,0.08)" />
            <Controls />
          </ReactFlow>
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
