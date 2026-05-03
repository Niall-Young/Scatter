import { Fragment, useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { RunMode, ScatterEdge, ScatterNode } from "../../../shared/types";
import { childCount } from "../lib/markdown";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";
import { Segmented, SegmentedItem } from "./ui/segmented";
import { TaskItem } from "./ui/task-item";
import { Toast, ToastViewport } from "./ui/toast";

interface RightDrawerProps {
  drawer: "tasks" | "markdown" | null;
  nodes: ScatterNode[];
  edges: ScatterEdge[];
  selectedNodeId: string | null;
  markdown: string;
  currentRunMode: RunMode;
  onPreviewNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onRunNode: (nodeId: string, mode: RunMode) => void;
}

type MarkdownView = "source" | "preview";

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableDivider(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]*$/.test(line.trim());
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function MarkdownPreview({ markdown }: { markdown: string }): ReactElement {
  const blocks: ReactElement[] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre className="markdown-preview-code" key={`code-${index}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (isTableLine(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableLine(lines[index])) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <table className="markdown-preview-table" key={`table-${index}`}>
          <thead>
            <tr>
              {headers.map((cell, cellIndex) => (
                <th key={cellIndex}>{inlineMarkdown(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {headers.map((_, cellIndex) => (
                  <td key={cellIndex}>{inlineMarkdown(row[cellIndex] || "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const content = trimmed.replace(/^#{1,6}\s+/, "");
      const Heading = `h${Math.min(level, 4)}` as "h1" | "h2" | "h3" | "h4";
      blocks.push(<Heading key={`heading-${index}`}>{inlineMarkdown(content)}</Heading>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^#{1,6}\s+/.test(next) || /^[-*]\s+/.test(next) || next.startsWith("```") || isTableLine(next)) break;
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{inlineMarkdown(paragraphLines.join(" "))}</p>);
  }

  return <div className="markdown-preview">{blocks}</div>;
}

export function RightDrawer({
  drawer,
  nodes,
  edges,
  selectedNodeId,
  markdown,
  currentRunMode,
  onPreviewNode,
  onSelectNode,
  onRunNode
}: RightDrawerProps): ReactElement | null {
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");
  const [markdownView, setMarkdownView] = useState<MarkdownView>("source");

  useEffect(() => {
    if (copyStatus !== "success") return undefined;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  if (!drawer) return null;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  function downloadMarkdown(): void {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedNode?.data.title || "scatter-prompt"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyMarkdown(): Promise<void> {
    await navigator.clipboard.writeText(markdown);
    setCopyStatus("success");
  }

  return (
    <aside className={`right-drawer is-${drawer}`} aria-label={drawer === "tasks" ? "任务清单" : "Markdown 预览"}>
      {drawer === "tasks" ? (
        <div className="task-sidebar">
          <p className="right-sidebar-title">任务清单</p>
          <div className="task-list">
            {nodes.length === 0 ? (
              <p className="empty-copy">画布中还没有任务节点。</p>
            ) : (
              nodes.map((node) => {
                const downstreamCount = childCount(node.id, edges);
                const isFlow = downstreamCount > 0 || (node.data.runMode || "flow") === "flow";

                return (
                  <TaskItem
                    key={node.id}
                    className={node.id === selectedNodeId ? "is-active" : undefined}
                    flow={isFlow}
                    meta={isFlow ? `共 ${downstreamCount + 1} 个流程节点` : "已准备就绪"}
                    nodeCount={downstreamCount + 1}
                    taskName={node.data.title || "未命名任务"}
                    onClick={() => onSelectNode(node.id)}
                    onMessage={() => onPreviewNode(node.id)}
                    onPlay={() => onRunNode(node.id, node.data.runMode || "flow")}
                  />
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="markdown-pane">
          <div className="markdown-sidebar-heading">
            <Segmented aria-label="预览模式">
              <SegmentedItem
                icon="marker-code"
                selected={markdownView === "source"}
                aria-label="Markdown 源码"
                onClick={() => setMarkdownView("source")}
              />
              <SegmentedItem
                icon="notebook-narrow"
                selected={markdownView === "preview"}
                aria-label="Markdown 渲染预览"
                onClick={() => setMarkdownView("preview")}
              />
            </Segmented>
            <div className="markdown-actions">
              <IconButton className="topbar-icon-button" filled={false} icon="download" size="md" aria-label="下载 Markdown" disabled={!markdown} onClick={downloadMarkdown} />
              <IconButton
                className="topbar-icon-button"
                filled={false}
                icon={copyStatus === "success" ? "check-md" : "copy"}
                size="md"
                aria-label={copyStatus === "success" ? "已复制 Markdown" : "复制 Markdown"}
                disabled={!markdown}
                onClick={() => void copyMarkdown()}
              />
            </div>
          </div>
          {markdownView === "source" ? (
            <pre className="markdown-source">{markdown || "选择一个节点后，这里会显示发送给 Codex 的 Markdown。"}</pre>
          ) : markdown ? (
            <MarkdownPreview markdown={markdown} />
          ) : (
            <div className="markdown-preview">
              <p>选择一个节点后，这里会显示发送给 Codex 的 Markdown。</p>
            </div>
          )}
          {selectedNode ? (
            <Button variant="primary" onClick={() => onRunNode(selectedNode.id, currentRunMode)}>
              <Icon name="external-link" size={16} />
              <span>发送到 Codex</span>
            </Button>
          ) : null}
          {copyStatus === "success" ? (
            <ToastViewport>
              <Toast tone="positive" message="已复制 Markdown" onClose={() => setCopyStatus("idle")} />
            </ToastViewport>
          ) : null}
        </div>
      )}
    </aside>
  );
}
