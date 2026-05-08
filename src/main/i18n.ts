import type { LanguagePreference } from "../shared/types";

const mainText = {
  zh: {
    chooseProjectCreateTitle: "选择或创建 Scatter 项目文件夹",
    chooseProjectOpenTitle: "打开 Scatter 项目文件夹",
    chooseAttachmentsTitle: "选择要添加到 Scatter 的附件",
    codexAccessibilityError:
      "Codex 已打开新线程，但 Scatter 没有权限自动粘贴并发送。请在 macOS“系统设置 > 隐私与安全性 > 辅助功能”里允许当前终端或 Scatter 控制 Codex。原始错误：{detail}",
    claudeCliMissingError:
      "没有找到 Claude Code CLI。请先安装并登录 Claude Code，或确保 `claude` 在 PATH 中可用。",
    claudeTerminalError:
      "Scatter 无法操作 Terminal 中的 Claude Code。请确认 macOS 允许 Scatter 控制 Terminal，或手动运行提示中的命令。原始错误：{detail}"
  },
  en: {
    chooseProjectCreateTitle: "Choose or create a Scatter project folder",
    chooseProjectOpenTitle: "Open a Scatter project folder",
    chooseAttachmentsTitle: "Choose attachments for Scatter",
    codexAccessibilityError:
      "Codex opened a new thread, but Scatter does not have permission to paste and submit automatically. Allow the current terminal or Scatter to control Codex in macOS System Settings > Privacy & Security > Accessibility. Original error: {detail}",
    claudeCliMissingError:
      "Claude Code CLI was not found. Install and sign in to Claude Code first, or make sure `claude` is available in PATH.",
    claudeTerminalError:
      "Scatter could not operate Claude Code in Terminal. Allow Scatter to control Terminal in macOS, or run the shown command manually. Original error: {detail}"
  }
} satisfies Record<LanguagePreference, Record<string, string>>;

type MainTextKey = keyof typeof mainText.zh;

export function tMain(language: LanguagePreference, key: MainTextKey, values: Record<string, string | number> = {}): string {
  const dictionary = mainText[language] ?? mainText.zh;
  return dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  );
}
