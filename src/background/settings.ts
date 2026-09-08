// 设置读写(chrome.storage.local) —— 默认值见 types/memory.ts DEFAULT_SETTINGS
// 读取时与默认值合并并夹取合法区间,防止旧值/脏数据污染行为。

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type PddSettings,
} from "../types/memory";
import { loadFromChrome, saveToChrome } from "../utils/chrome-storage";

function clampSettings(raw: Partial<PddSettings>): PddSettings {
  const base = { ...DEFAULT_SETTINGS, ...raw };
  return {
    directFillEnabled: !!base.directFillEnabled,
    simThreshold: Math.min(1, Math.max(0, Number(base.simThreshold) || DEFAULT_SETTINGS.simThreshold)),
    goldenThreshold: Math.min(1, Math.max(0, Number(base.goldenThreshold) || DEFAULT_SETTINGS.goldenThreshold)),
    retentionDays: Math.min(365, Math.max(30, Math.round(Number(base.retentionDays) || DEFAULT_SETTINGS.retentionDays))),
    goldenPriorityEnabled: !!base.goldenPriorityEnabled,
  };
}

function isValidPartial(v: unknown): v is Partial<PddSettings> {
  return typeof v === "object" && v !== null;
}

export async function loadSettings(): Promise<PddSettings> {
  const stored = await loadFromChrome<Partial<PddSettings>>(
    SETTINGS_STORAGE_KEY,
    isValidPartial,
  );
  return clampSettings(stored ?? {});
}

export async function saveSettings(patch: Partial<PddSettings>): Promise<void> {
  const merged = clampSettings({ ...(await loadSettings()), ...patch });
  await saveToChrome(SETTINGS_STORAGE_KEY, merged);
  return Promise.resolve();
}
