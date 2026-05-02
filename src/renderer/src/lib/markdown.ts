import type { Attachment, RunMode, ScatterEdge, ScatterNode } from "../../../shared/types";

export interface MarkdownResult {
  markdown: string;
  nodes: ScatterNode[];
  attachments: Attachment[];
  imagePaths: string[];
  planMode: boolean;
  hasCycle: boolean;
}

function downstreamNodeIds(startId: string, edges: ScatterEdge[]): { ids: Set<string>; hasCycle: boolean } {
  const ids = new Set<string>([startId]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let hasCycle = false;

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      hasCycle = true;
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);

    for (const edge of edges.filter((item) => item.source === nodeId)) {
      ids.add(edge.target);
      visit(edge.target);
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  visit(startId);
  return { ids, hasCycle };
}

function sortFlow(nodes: ScatterNode[], edges: ScatterEdge[], startId: string): ScatterNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const included = new Set(nodes.map((node) => node.id));
  const ordered: ScatterNode[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (node) ordered.push(node);
    const children = edges
      .filter((edge) => edge.source === nodeId && included.has(edge.target))
      .sort((a, b) => {
        const left = nodeById.get(a.target);
        const right = nodeById.get(b.target);
        return (left?.position.y ?? 0) - (right?.position.y ?? 0) || (left?.position.x ?? 0) - (right?.position.x ?? 0);
      });
    for (const edge of children) visit(edge.target);
  };

  visit(startId);
  const remaining = nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return [...ordered, ...remaining];
}

function attachmentLine(attachment: Attachment): string {
  return `- ${attachment.kind === "image" ? "Image" : "File"}: ${attachment.originalName}
  - Relative path: \`${attachment.relativePath}\`
  - Absolute path: \`${attachment.storedPath}\`
  - Source: ${attachment.source}`;
}

function nodeBlock(node: ScatterNode, index: number): string {
  const title = node.data.title?.trim() || `Untitled task ${index + 1}`;
  const body = node.data.body?.trim() || "_No prompt text provided._";
  const attachments = node.data.attachments.length
    ? node.data.attachments.map(attachmentLine).join("\n")
    : "- None";

  return `## ${index + 1}. ${title}

Node ID: \`${node.id}\`
Plan mode: ${node.data.planMode ? "enabled" : "disabled"}

### Prompt
${body}

### Attachments
${attachments}`;
}

export function buildMarkdown(
  allNodes: ScatterNode[],
  allEdges: ScatterEdge[],
  startNodeId: string | null,
  runMode: RunMode,
  projectName: string,
  projectPath: string
): MarkdownResult {
  const startNode = startNodeId ? allNodes.find((node) => node.id === startNodeId) : null;
  const nodeIds =
    startNode && runMode === "flow"
      ? downstreamNodeIds(startNode.id, allEdges)
      : { ids: new Set(startNode ? [startNode.id] : allNodes.map((node) => node.id)), hasCycle: false };

  const selectedNodes = allNodes.filter((node) => nodeIds.ids.has(node.id));
  const orderedNodes = startNode ? sortFlow(selectedNodes, allEdges, startNode.id) : selectedNodes;
  const selectedIds = new Set(orderedNodes.map((node) => node.id));
  const selectedEdges = allEdges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target));
  const attachments = orderedNodes.flatMap((node) => node.data.attachments);
  const imagePaths = attachments.filter((attachment) => attachment.kind === "image").map((attachment) => attachment.storedPath);
  const planMode = orderedNodes.some((node) => node.data.planMode);
  const title = startNode?.data.title?.trim() || projectName || "Scatter Flow";
  const modeLabel = runMode === "flow" ? "Current node and downstream flow" : "Current node only";

  const connectionMap = selectedEdges.length
    ? selectedEdges
        .map((edge) => {
          const source = allNodes.find((node) => node.id === edge.source);
          const target = allNodes.find((node) => node.id === edge.target);
          return `- ${source?.data.title || edge.source} -> ${target?.data.title || edge.target}`;
        })
        .join("\n")
    : "- No downstream connections included.";

  const markdown = `# Scatter Task: ${title}

Project: ${projectName}
Project path: \`${projectPath}\`
Run mode: ${modeLabel}
Plan mode requested: ${planMode ? "yes" : "no"}

${nodeIds.hasCycle ? "> Warning: This flow contains a cycle. Nodes were ordered by traversal and canvas position.\n" : ""}## Execution Request
Use the following Scatter canvas context as the source of truth. Analyze the task structure, inspect referenced files when needed, and execute the requested work in this project.

## Included Nodes
${orderedNodes.map(nodeBlock).join("\n\n")}

## Connection Map
${connectionMap}

## All Attachments
${attachments.length ? attachments.map(attachmentLine).join("\n") : "- None"}
`;

  return {
    markdown,
    nodes: orderedNodes,
    attachments,
    imagePaths,
    planMode,
    hasCycle: nodeIds.hasCycle
  };
}

export function childCount(nodeId: string, edges: ScatterEdge[]): number {
  return downstreamNodeIds(nodeId, edges).ids.size - 1;
}
