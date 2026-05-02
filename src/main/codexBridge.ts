import { app, clipboard } from "electron";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CodexRunInput, CodexRunResult } from "../shared/types";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function codexExecutable(): string {
  return "/Applications/Codex.app/Contents/Resources/codex";
}

function defaultControlSocket(): string {
  return path.join(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "app-server-control", "app-server-control.sock");
}

function codexThreadUrl(threadId: string): string {
  return `codex://threads/${encodeURIComponent(threadId)}`;
}

function codexNewThreadUrl(projectPath: string): string {
  const params = new URLSearchParams({ path: projectPath });
  return `codex://threads/new?${params.toString()}`;
}

async function canUseBundledCodex(): Promise<boolean> {
  try {
    await access(codexExecutable());
    return true;
  } catch {
    return false;
  }
}

async function canUseDesktopProxy(): Promise<boolean> {
  try {
    await access(defaultControlSocket());
    return true;
  } catch {
    return false;
  }
}

async function spawnCodex(args: string[], waitMs = 1000): Promise<void> {
  const command = (await canUseBundledCodex()) ? codexExecutable() : "codex";
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  await delay(waitMs);
}

async function runCommand(command: string, args: string[], timeoutMs = 5000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, timeoutMs);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
    });
  });
}

async function openCodexUrl(url: string, waitMs = 700): Promise<void> {
  await runCommand("open", [url], 5000);
  await delay(waitMs);
}

async function focusCodex(): Promise<void> {
  const child = spawn("open", ["-a", "Codex"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  await delay(250);
}

async function pasteAndSubmitInCodex(): Promise<void> {
  const script = [
    'tell application "Codex" to activate',
    "delay 0.7",
    'tell application "System Events"',
    '  tell process "Codex" to set frontmost to true',
    '  keystroke "v" using {command down}',
    "  delay 0.2",
    "  key code 36",
    "end tell"
  ].join("\n");

  try {
    await runCommand("osascript", ["-e", script], 8000);
  } catch (error) {
    throw new Error(
      `Codex 已打开新线程，但 Scatter 没有权限自动粘贴并发送。请在 macOS“系统设置 > 隐私与安全性 > 辅助功能”里允许当前终端或 Scatter 控制 Codex。原始错误：${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

class CodexProxy {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly child;
  private stdoutBuffer = "";
  private stderrBuffer = "";

  constructor(command: string) {
    this.child = spawn(command, ["app-server", "proxy"], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");

    this.child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      this.readStdoutLines();
    });

    this.child.stderr.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
    });

    this.child.on("exit", () => {
      const error = new Error(this.stderrBuffer.trim() || "Codex app-server proxy exited.");
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(error);
      }
      this.pending.clear();
    });
  }

  async request<T>(method: string, params: unknown, timeoutMs = 30000): Promise<T> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex response to ${method}.`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve,
        reject,
        timer
      });
    });

    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  dispose(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
    }
    this.pending.clear();
    this.child.kill();
  }

  private readStdoutLines(): void {
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) this.handleLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (typeof message.id !== "number") return;
    const request = this.pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(message.error.message || JSON.stringify(message.error)));
      return;
    }

    request.resolve(message.result);
  }
}

interface ThreadStartResponse {
  thread: { id: string };
  model: string;
  serviceTier?: string | null;
  cwd: string;
  approvalPolicy?: string;
  sandbox?: Record<string, unknown>;
  reasoningEffort?: string | null;
}

interface TurnStartResponse {
  turn?: { id?: string };
}

function markdownForCodex(input: CodexRunInput): string {
  if (!input.planMode) return input.markdown;
  return [
    "请先按计划模式处理这个 Scatter 任务：先给出清晰计划，等待用户确认后再执行。若当前 Codex 会话已经处于计划模式，请遵循计划模式交互。",
    "",
    input.markdown
  ].join("\n");
}

async function runViaDesktopProxy(input: CodexRunInput): Promise<CodexRunResult | null> {
  if (!(await canUseDesktopProxy())) return null;

  const command = (await canUseBundledCodex()) ? codexExecutable() : "codex";
  const prompt = markdownForCodex(input);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const proxy = new CodexProxy(command);
    try {
      await proxy.request("initialize", {
        clientInfo: {
          name: "Scatter",
          title: "Scatter",
          version: app.getVersion()
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: []
        }
      });

      const started = await proxy.request<ThreadStartResponse>("thread/start", {
        cwd: input.projectPath,
        serviceName: "Scatter",
        approvalPolicy: "on-request",
        sandbox: "workspace-write"
      });

      await proxy.request("thread/name/set", {
        threadId: started.thread.id,
        name: input.threadName
      });

      const userInput: Array<Record<string, unknown>> = [
        {
          type: "text",
          text: prompt,
          text_elements: []
        },
        ...input.imagePaths.map((imagePath) => ({
          type: "localImage",
          path: imagePath
        }))
      ];

      const turnParams: Record<string, unknown> = {
        threadId: started.thread.id,
        input: userInput,
        cwd: input.projectPath,
        approvalPolicy: started.approvalPolicy ?? "on-request",
        sandboxPolicy:
          started.sandbox ?? {
            type: "workspaceWrite",
            writableRoots: [input.projectPath],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          },
        model: started.model,
        serviceTier: started.serviceTier ?? null,
        effort: started.reasoningEffort ?? null,
        summary: "auto",
        personality: null,
        outputSchema: null
      };

      const turn = await proxy.request<TurnStartResponse>("turn/start", turnParams, 10000);
      await openCodexUrl(codexThreadUrl(started.thread.id), 400);
      await focusCodex();
      proxy.dispose();

      return {
        threadId: started.thread.id,
        turnId: turn.turn?.id,
        cwd: started.cwd || input.projectPath
      };
    } catch (error) {
      lastError = error;
      proxy.dispose();
      await delay(900);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to connect to Codex Desktop.");
}

async function runViaDesktopUi(input: CodexRunInput): Promise<CodexRunResult> {
  await openCodexUrl(codexNewThreadUrl(input.projectPath), 900);
  clipboard.writeText(markdownForCodex(input));
  await pasteAndSubmitInCodex();
  await focusCodex();

  return {
    threadId: "desktop-ui",
    cwd: input.projectPath
  };
}

export async function runInCodex(input: CodexRunInput): Promise<CodexRunResult> {
  await spawnCodex(["app", input.projectPath], 1400);
  const proxyResult = await runViaDesktopProxy(input);
  if (proxyResult) return proxyResult;
  return runViaDesktopUi(input);
}
