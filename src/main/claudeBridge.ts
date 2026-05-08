import { clipboard } from "electron";
import { constants } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CodexRunInput, CodexRunResult, EffortLevel } from "../shared/types";
import { tMain } from "./i18n";
import { getSettings } from "./settingsStore";

function runCommand(command: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
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
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function claudeEffort(effort: EffortLevel): string {
  return effort === "xhigh" ? "max" : effort;
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await access(command, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function claudeExecutable(): Promise<string> {
  if (process.env.CLAUDE_CODE_PATH && (await commandExists(process.env.CLAUDE_CODE_PATH))) {
    return process.env.CLAUDE_CODE_PATH;
  }

  try {
    const resolved = await runCommand("/bin/zsh", ["-lc", "command -v claude"], 5000);
    const shellCandidate = resolved.split(/\r?\n/)[0];
    if (shellCandidate && (await commandExists(shellCandidate))) return shellCandidate;
  } catch {
    // Fall through to common install paths.
  }

  const candidates = [
    `${process.env.HOME || ""}/.local/bin/claude`,
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await commandExists(candidate)) return candidate;
  }

  const settings = await getSettings();
  throw new Error(tMain(settings.language, "claudeCliMissingError"));
}

async function supportsSessionName(command: string): Promise<boolean> {
  try {
    const help = await runCommand(command, ["--help"], 5000);
    return /(?:^|\s)--name\s+<name>/.test(help);
  } catch {
    return false;
  }
}

async function runTerminalScript(command: string): Promise<void> {
  const script = [
    "tell application \"Terminal\"",
    "  activate",
    `  do script ${appleScriptString(command)}`,
    "end tell"
  ].join("\n");

  await runCommand("osascript", ["-e", script], 8000);
  await delay(900);
}

async function focusExistingClaudeTerminal(): Promise<boolean> {
  const script = [
    "tell application \"Terminal\"",
    "  if not (it is running) then return \"missing\"",
    "  repeat with terminalWindow in windows",
    "    repeat with terminalTab in tabs of terminalWindow",
    "      try",
    "        if processes of terminalTab contains \"claude\" then",
    "          set selected tab of terminalWindow to terminalTab",
    "          set index of terminalWindow to 1",
    "          activate",
    "          return \"found\"",
    "        end if",
    "      end try",
    "    end repeat",
    "  end repeat",
    "end tell",
    "return \"missing\""
  ].join("\n");

  try {
    return (await runCommand("osascript", ["-e", script], 8000)).trim() === "found";
  } catch {
    return false;
  }
}

async function sendPromptToFocusedTerminal(markdown: string): Promise<void> {
  clipboard.writeText(markdown);
  const script = [
    "tell application \"Terminal\" to activate",
    "delay 0.2",
    "tell application \"System Events\"",
    "  tell process \"Terminal\" to set frontmost to true",
    "  keystroke \"v\" using {command down}",
    "  delay 0.2",
    "  key code 36",
    "end tell"
  ].join("\n");

  await runCommand("osascript", ["-e", script], 8000);
}

export async function runInClaudeCode(input: CodexRunInput): Promise<CodexRunResult> {
  if (await focusExistingClaudeTerminal()) {
    try {
      await sendPromptToFocusedTerminal(input.markdown);
    } catch (error) {
      const settings = await getSettings();
      throw new Error(tMain(settings.language, "claudeTerminalError", {
        detail: error instanceof Error ? error.message : String(error)
      }));
    }

    return {
      threadId: "claude-terminal",
      cwd: input.projectPath
    };
  }

  const executable = await claudeExecutable();
  const runDir = await mkdtemp(path.join(tmpdir(), "scatter-claude-"));
  const promptPath = path.join(runDir, "prompt.md");
  const scriptPath = path.join(runDir, "run.zsh");
  const claudeArgs = [
    "--effort",
    shellQuote(claudeEffort(input.effort)),
    "--permission-mode",
    shellQuote(input.planMode ? "plan" : "default")
  ];

  if (await supportsSessionName(executable)) {
    claudeArgs.push("--name", shellQuote(input.threadName));
  }

  await writeFile(promptPath, input.markdown, "utf8");
  await writeFile(
    scriptPath,
    [
      "#!/bin/zsh",
      `cd ${shellQuote(input.projectPath)} || exit 1`,
      `prompt_file=${shellQuote(promptPath)}`,
      'prompt="$(cat "$prompt_file")"',
      'rm -f "$prompt_file"',
      `rm -f ${shellQuote(scriptPath)}`,
      `rmdir ${shellQuote(runDir)} 2>/dev/null || true`,
      `exec ${shellQuote(executable)} ${claudeArgs.join(" ")} "$prompt"`
    ].join("\n"),
    "utf8"
  );

  try {
    await runTerminalScript(`/bin/zsh ${shellQuote(scriptPath)}`);
  } catch (error) {
    const settings = await getSettings();
    throw new Error(tMain(settings.language, "claudeTerminalError", {
      detail: error instanceof Error ? error.message : String(error)
    }));
  }

  return {
    threadId: "claude-terminal",
    cwd: input.projectPath
  };
}
