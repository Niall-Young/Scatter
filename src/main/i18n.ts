import type { LanguagePreference } from "../shared/types";

const mainText = {
  zh: {
    chooseProjectCreateTitle: "选择或创建 Scatter 项目文件夹",
    chooseProjectOpenTitle: "打开 Scatter 项目文件夹",
    chooseAttachmentsTitle: "选择要添加到 Scatter 的附件",
    projectMissingError: "项目文件夹已不存在，请从项目列表中移除后重新添加。",
    codexAccessibilityError:
      "Codex 已打开新线程，但 Scatter 没有权限自动粘贴并发送。请在 macOS“系统设置 > 隐私与安全性 > 辅助功能”里允许当前终端或 Scatter 控制 Codex。原始错误：{detail}",
    codexClipboardError: "Scatter 没能把提示词写入系统剪贴板，请重试一次。",
    claudeCliMissingError:
      "没有找到 Claude CLI。请先安装并登录 Claude CLI，或确保 `claude` 在 PATH 中可用。",
    claudeTerminalError:
      "Scatter 无法操作 Terminal 中的 Claude CLI。请确认 macOS 允许 Scatter 控制 Terminal，或手动运行提示中的命令。原始错误：{detail}"
  },
  en: {
    chooseProjectCreateTitle: "Choose or create a Scatter project folder",
    chooseProjectOpenTitle: "Open a Scatter project folder",
    chooseAttachmentsTitle: "Choose attachments for Scatter",
    projectMissingError: "The project folder no longer exists. Remove it from the project list and add it again.",
    codexAccessibilityError:
      "Codex opened a new thread, but Scatter does not have permission to paste and submit automatically. Allow the current terminal or Scatter to control Codex in macOS System Settings > Privacy & Security > Accessibility. Original error: {detail}",
    codexClipboardError: "Scatter could not write the prompt to the system clipboard. Please try again.",
    claudeCliMissingError:
      "Claude CLI was not found. Install and sign in to Claude CLI first, or make sure `claude` is available in PATH.",
    claudeTerminalError:
      "Scatter could not operate Claude CLI in Terminal. Allow Scatter to control Terminal in macOS, or run the shown command manually. Original error: {detail}"
  }
} satisfies Record<LanguagePreference, Record<string, string>>;

type MainTextKey = keyof typeof mainText.zh;

export function tMain(language: LanguagePreference, key: MainTextKey, values: Record<string, string | number> = {}): string {
  const dictionary = mainText[language] ?? mainText.zh;
  return dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  );
}
