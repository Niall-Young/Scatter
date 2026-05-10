import { app, clipboard } from "electron";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CodexRunInput, CodexRunResult } from "../shared/types";
import { requestAccessibilityPermission } from "./accessibilityPermission";
import { tMain } from "./i18n";
import { getSettings } from "./settingsStore";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface AppServerTransport {
  kind: "desktop-proxy" | "stdio";
  proxy: CodexProxy;
}

const PROMPT_DEEP_LINK_MAX_LENGTH = 8000;

function codexExecutable(): string {
  return "/Applications/Codex.app/Contents/Resources/codex";
}

function defaultControlSocket(): string {
  return path.join(process.env.CODEX_HOME || path.join(homedir(), ".codex"), "app-server-control", "app-server-control.sock");
}

function codexNewThreadUrl(projectPath: string, prompt?: string): string {
  const params = new URLSearchParams({ path: projectPath });
  if (prompt) {
    params.set("prompt", prompt);
  }
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

function pasteSettleDelaySeconds(markdown: string): string {
  const seconds = Math.min(8, Math.max(0.6, markdown.length / 6000));
  return seconds.toFixed(2);
}

async function submitInVisibleCodexComposer(markdown: string, planMode: boolean, pastePrompt: boolean): Promise<void> {
  requestAccessibilityPermission();
  const script = [
    'tell application "Codex" to activate',
    "delay 1.2",
    'tell application "System Events"',
    '  if not (exists process "Codex") then error "Codex process is not available."',
    '  tell process "Codex"',
    '    set frontmost to true',
    '    repeat 30 times',
    '      if (count of windows) > 0 then exit repeat',
    "      delay 0.2",
    "    end repeat",
    '    if (count of windows) = 0 then error "Codex window did not open."',
    '    set codexWindow to window 1',
    "    try",
    '      perform action "AXRaise" of codexWindow',
    "    end try",
    "    delay 0.2",
    "    set {windowX, windowY} to position of codexWindow",
    "    set {windowWidth, windowHeight} to size of codexWindow",
    "    set composerX to windowX + (windowWidth / 2)",
    "    set composerY to windowY + windowHeight - 90",
    "    click at {composerX as integer, composerY as integer}",
    "  end tell",
    "  delay 0.25",
    ...(planMode ? ['  key code 48 using {shift down}', "  delay 0.2"] : []),
    ...(pastePrompt ? ['  keystroke "v" using {command down}', `  delay ${pasteSettleDelaySeconds(markdown)}`] : ["  delay 0.45"]),
    "  key code 36",
    "end tell"
  ].join("\n");

  try {
    await runCommand("osascript", ["-e", script], pastePrompt ? 18000 : 10000);
  } catch (error) {
    const settings = await getSettings();
    throw new Error(tMain(settings.language, "codexAccessibilityError", {
      detail: error instanceof Error ? error.message : String(error)
    }));
  }
}

class CodexProxy {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly child;
  private closed = false;
  private initialized = false;
  private stdoutBuffer = "";
  private stderrBuffer = "";

  constructor(command: string, args: string[]) {
    this.child = spawn(command, args, {
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
      if (this.stderrBuffer.length > 20000) {
        this.stderrBuffer = this.stderrBuffer.slice(-20000);
      }
    });

    this.child.on("error", (error) => {
      this.closed = true;
      this.failPending(error instanceof Error ? error : new Error(String(error)));
    });

    this.child.on("exit", () => {
      this.closed = true;
      this.failPending(new Error(this.stderrBuffer.trim() || "Codex app-server exited."));
    });
  }

  isClosed(): boolean {
    return this.closed;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  markInitialized(): void {
    this.initialized = true;
  }

  async request<T>(method: string, params: unknown, timeoutMs = 30000): Promise<T> {
    if (this.closed) {
      throw new Error(this.stderrBuffer.trim() || "Codex app-server is not running.");
    }
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
    this.closed = true;
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

  private failPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}

async function createAppServerTransport(command: string, useDesktopProxy: boolean): Promise<AppServerTransport> {
  if (useDesktopProxy) {
    return {
      kind: "desktop-proxy",
      proxy: new CodexProxy(command, ["app-server", "proxy"])
    };
  }

  return {
    kind: "stdio",
    proxy: new CodexProxy(command, ["app-server", "--listen", "stdio://"])
  };
}

async function initializeProxy(proxy: CodexProxy): Promise<void> {
  if (proxy.isInitialized()) return;
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
  proxy.markInitialized();
}

async function withAppServer(run: (proxy: CodexProxy) => Promise<void>): Promise<void> {
  const command = (await canUseBundledCodex()) ? codexExecutable() : "codex";
  const shouldTryDesktopProxy = await canUseDesktopProxy();
  const attempts = shouldTryDesktopProxy ? [true, false] : [false, false];

  let lastError: unknown;
  for (const useDesktopProxy of attempts) {
    const transport = await createAppServerTransport(command, useDesktopProxy);
    const proxy = transport.proxy;
    try {
      await initializeProxy(proxy);
      await run(proxy);
      proxy.dispose();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Codex app-server ${transport.kind} failed.`, error);
      proxy.dispose();
      await delay(900);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to connect to Codex Desktop.");
}

async function applyVisibleRunPreferences(input: CodexRunInput): Promise<void> {
  await withAppServer(async (proxy) => {
    await proxy.request("config/batchWrite", {
      edits: [
        {
          keyPath: "model_reasoning_effort",
          mergeStrategy: "upsert",
          value: input.effort
        }
      ],
      expectedVersion: null,
      filePath: null,
      reloadUserConfig: true
    }, 5000);
  });
}

async function runViaVisibleCodex(input: CodexRunInput): Promise<CodexRunResult> {
  await applyVisibleRunPreferences(input).catch((error) => {
    console.warn("Unable to apply Codex visible-run preferences.", error);
  });

  const canUsePromptDeepLink = input.markdown.length <= PROMPT_DEEP_LINK_MAX_LENGTH;
  if (!canUsePromptDeepLink) {
    clipboard.writeText(input.markdown);
    if (clipboard.readText() !== input.markdown) {
      const settings = await getSettings();
      throw new Error(tMain(settings.language, "codexClipboardError"));
    }
  }

  await openCodexUrl(codexNewThreadUrl(input.projectPath, canUsePromptDeepLink ? input.markdown : undefined), 2200);
  await submitInVisibleCodexComposer(input.markdown, input.planMode, !canUsePromptDeepLink);
  await focusCodex();

  return {
    threadId: "desktop-ui",
    cwd: input.projectPath
  };
}

export async function runInCodex(input: CodexRunInput): Promise<CodexRunResult> {
  await spawnCodex(["app", input.projectPath], 1400);
  return runViaVisibleCodex(input);
}
