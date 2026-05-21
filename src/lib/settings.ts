import { useSyncExternalStore } from "react";
import type { LLMConfig } from "./llm";

export type ApiMode = "openai-compatible";

export type ModelEntry = {
  id: string; // 真正传给 LLM 的 model id，比如 "[L]gemini-3-flash-preview"
  name: string; // 显示名
};

/** 上下文窗口与栈式压缩的参数（"高级选项"） */
export type ContextConfig = {
  /** 当前帧内追问时，带最近 N 条消息（滑动窗口） */
  windowN: number;
  /** push 子帧时，每个"近祖先帧"带最近 K 条对话 */
  ancestorK: number;
  /** 栈深差 ≤ 该值的祖先视为"近祖先"，更远的祖先只压成 lastAssistantExcerpt */
  compressDepth: number;
  /** "lastAssistantExcerpt" 的最大字符数 */
  excerptMaxChars: number;
};

export type Settings = {
  apiMode: ApiMode;
  /** 服务端托管：密钥由 Nginx 反代注入，浏览器不保存 Key */
  hosted: boolean;
  baseUrl: string;
  apiKey: string;
  models: ModelEntry[];
  selectedModelId: string | null;
  context: ContextConfig;
};

const STORAGE_KEY = "recursive-learner:settings:v1";

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  windowN: 6,
  ancestorK: 4,
  compressDepth: 2,
  excerptMaxChars: 240,
};

const DEFAULT_SETTINGS: Settings = {
  apiMode: "openai-compatible",
  hosted: false,
  baseUrl: "",
  apiKey: "",
  models: [],
  selectedModelId: null,
  context: DEFAULT_CONTEXT_CONFIG,
};

function readFromStorage(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      models: Array.isArray(parsed.models) ? parsed.models : [],
      context: { ...DEFAULT_CONTEXT_CONFIG, ...(parsed.context ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let cache: Settings = readFromStorage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSettingsSnapshot(): Settings {
  return cache;
}

export function setSettings(next: Settings) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  emit();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettingsSnapshot, getSettingsSnapshot);
}

export function getSelectedModel(s: Settings): ModelEntry | null {
  if (!s.selectedModelId) return null;
  return s.models.find((m) => m.id === s.selectedModelId) ?? null;
}

export function isConfigured(s: Settings): boolean {
  const model = getSelectedModel(s);
  if (!s.baseUrl || !model) return false;
  if (s.hosted) return true;
  return Boolean(s.apiKey);
}

export function toLLMConfig(s: Settings): LLMConfig | null {
  const m = getSelectedModel(s);
  if (!m || !s.baseUrl) return null;
  if (!s.hosted && !s.apiKey) return null;
  return { baseUrl: s.baseUrl, apiKey: s.apiKey, model: m.id };
}
