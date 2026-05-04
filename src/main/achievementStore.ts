import { app } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  achievementIds,
  defaultAchievementState,
  type AchievementId,
  type AchievementState
} from "../shared/types";

const achievementsFileName = "achievements.json";

const projectCountAchievements = [
  { id: "oneshot", count: 1 },
  { id: "gunslinger", count: 2 },
  { id: "three-musketeers", count: 3 }
] satisfies Array<{ id: AchievementId; count: number }>;

const usageStreakAchievements = [
  { id: "double-take", days: 2 },
  { id: "idea-overlord", days: 7 },
  { id: "master-builder", days: 30 }
] satisfies Array<{ id: AchievementId; days: number }>;

function achievementsPath(): string {
  return path.join(app.getPath("userData"), achievementsFileName);
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isLocalDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function uniqueDates(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isLocalDateString))].sort();
}

function normalizeAchievements(input: unknown): AchievementState {
  if (!input || typeof input !== "object") return { ...defaultAchievementState, unlockedAt: {}, projectPaths: [], usageDates: [] };
  const candidate = input as Partial<AchievementState>;
  const unlockedAt: Partial<Record<AchievementId, string>> = {};
  const rawUnlockedAt = candidate.unlockedAt;

  if (rawUnlockedAt && typeof rawUnlockedAt === "object") {
    for (const id of achievementIds) {
      const achievedAt = (rawUnlockedAt as Partial<Record<AchievementId, unknown>>)[id];
      if (isLocalDateString(achievedAt)) {
        unlockedAt[id] = achievedAt;
      }
    }
  }

  return {
    unlockedAt,
    projectPaths: uniqueStrings(candidate.projectPaths),
    usageDates: uniqueDates(candidate.usageDates)
  };
}

async function saveAchievements(state: AchievementState): Promise<AchievementState> {
  const next = normalizeAchievements(state);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(achievementsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function unlock(state: AchievementState, id: AchievementId, achievedAt = localDateString()): boolean {
  if (state.unlockedAt[id]) return false;
  state.unlockedAt[id] = achievedAt;
  return true;
}

function consecutiveUsageDays(usageDates: string[], today: string): number {
  const usageDateSet = new Set(usageDates);
  const cursor = parseLocalDate(today);
  let count = 0;

  while (usageDateSet.has(localDateString(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
}

export async function getAchievements(): Promise<AchievementState> {
  const filePath = achievementsPath();
  if (!existsSync(filePath)) return normalizeAchievements(defaultAchievementState);

  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeAchievements(JSON.parse(raw));
  } catch {
    return normalizeAchievements(defaultAchievementState);
  }
}

export async function recordProjectOpened(projectPath: string): Promise<AchievementState> {
  const state = await getAchievements();
  let changed = false;

  if (projectPath && !state.projectPaths.includes(projectPath)) {
    state.projectPaths.push(projectPath);
    changed = true;
  }

  for (const achievement of projectCountAchievements) {
    changed = state.projectPaths.length >= achievement.count ? unlock(state, achievement.id) || changed : changed;
  }

  return changed ? saveAchievements(state) : state;
}

export async function recordUsageToday(): Promise<AchievementState> {
  const state = await getAchievements();
  const today = localDateString();
  let changed = false;

  if (!state.usageDates.includes(today)) {
    state.usageDates = [...state.usageDates, today].sort();
    changed = true;
  }

  const streakDays = consecutiveUsageDays(state.usageDates, today);
  for (const achievement of usageStreakAchievements) {
    changed = streakDays >= achievement.days ? unlock(state, achievement.id, today) || changed : changed;
  }

  return changed ? saveAchievements(state) : state;
}

export async function unlockAchievement(id: AchievementId): Promise<AchievementState> {
  const state = await getAchievements();
  return unlock(state, id) ? saveAchievements(state) : state;
}
