import type { AssistantRunInput, AssistantRunResult, CodexRunInput, CodexRunResult } from "../shared/types";
import { runInClaudeCode } from "./claudeBridge";
import { runInCodex } from "./codexBridge";

function codexInput(input: AssistantRunInput): CodexRunInput {
  return {
    projectPath: input.projectPath,
    threadName: input.threadName,
    markdown: input.markdown,
    imagePaths: input.imagePaths,
    effort: input.effort,
    planMode: input.planMode
  };
}

function assistantResult(provider: AssistantRunInput["provider"], result: CodexRunResult): AssistantRunResult {
  return {
    provider,
    threadId: result.threadId,
    turnId: result.turnId,
    cwd: result.cwd
  };
}

export async function runAssistant(input: AssistantRunInput): Promise<AssistantRunResult> {
  if (input.provider === "claude-code") {
    return assistantResult(input.provider, await runInClaudeCode(codexInput(input)));
  }

  return assistantResult(input.provider, await runInCodex(codexInput(input)));
}
