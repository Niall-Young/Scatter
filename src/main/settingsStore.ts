import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  defaultAppSettings,
  type AppSettings,
  type AssistantProvider,
  type LanguagePreference,
  type ThemePreference
} from "../shared/types";

const settingsFileName = "settings.json";

function settingsPath(): string {
  return path.join(app.getPath("userData"), settingsFileName);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "zh" || value === "en";
}

function isAssistantProvider(value: unknown): value is AssistantProvider {
  return value === "codex" || value === "claude-code";
}

function normalizeSettings(input: unknown): AppSettings {
  if (!input || typeof input !== "object") return defaultAppSettings;
  const candidate = input as Partial<AppSettings>;

  return {
    themePreference: isThemePreference(candidate.themePreference) ? candidate.themePreference : defaultAppSettings.themePreference,
    language: isLanguagePreference(candidate.language) ? candidate.language : defaultAppSettings.language,
    translucentBackground:
      typeof candidate.translucentBackground === "boolean"
        ? candidate.translucentBackground
        : defaultAppSettings.translucentBackground,
    assistantProvider: isAssistantProvider(candidate.assistantProvider)
      ? candidate.assistantProvider
      : defaultAppSettings.assistantProvider
  };
}

export async function getSettings(): Promise<AppSettings> {
  const filePath = settingsPath();
  if (!existsSync(filePath)) return defaultAppSettings;

  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultAppSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const next = normalizeSettings(settings);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
