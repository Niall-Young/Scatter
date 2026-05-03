import { create } from "zustand";
import type {
  Attachment,
  RunMode,
  ScatterDocument,
  ScatterEdge,
  ScatterNode,
  ScatterProjectInfo
} from "../../../shared/types";

interface ScatterState {
  project: ScatterProjectInfo | null;
  document: ScatterDocument | null;
  nodes: ScatterNode[];
  edges: ScatterEdge[];
  selectedNodeId: string | null;
  drawer: "tasks" | "markdown" | null;
  theme: "light" | "dark";
  status: string;
  isSaving: boolean;
  setProjectDocument: (project: ScatterProjectInfo, document: ScatterDocument) => void;
  setNodes: (nodes: ScatterNode[]) => void;
  setEdges: (edges: ScatterEdge[]) => void;
  updateNodeData: (nodeId: string, patch: Partial<ScatterNode["data"]>) => void;
  appendAttachments: (nodeId: string, attachments: Attachment[]) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setDrawer: (drawer: "tasks" | "markdown" | null) => void;
  setTheme: (theme: "light" | "dark") => void;
  setStatus: (status: string) => void;
  setSaving: (isSaving: boolean) => void;
  markNodeRun: (nodeId: string, runMode: RunMode) => void;
}

export const useScatterStore = create<ScatterState>((set, get) => ({
  project: null,
  document: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  drawer: null,
  theme: "light",
  status: "Ready",
  isSaving: false,
  setProjectDocument: (project, document) =>
    set({
      project,
      document,
      nodes: document.nodes.map((node) => ({ ...node, selected: false })),
      edges: document.edges,
      selectedNodeId: null,
      status: `Opened ${project.name}`
    }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  updateNodeData: (nodeId, patch) =>
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch
              }
            }
          : node
      )
    }),
  appendAttachments: (nodeId, attachments) =>
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                attachments: [...node.data.attachments, ...attachments]
              }
            }
          : node
      )
    }),
  removeAttachment: (nodeId, attachmentId) =>
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                attachments: node.data.attachments.filter((attachment) => attachment.id !== attachmentId)
              }
            }
          : node
      )
    }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setDrawer: (drawer) => set({ drawer }),
  setTheme: (theme) => set({ theme }),
  setStatus: (status) => set({ status }),
  setSaving: (isSaving) => set({ isSaving }),
  markNodeRun: (nodeId, runMode) =>
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                runMode,
                lastRunAt: new Date().toISOString()
              }
            }
          : node
      )
    })
}));
