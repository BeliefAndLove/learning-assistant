import type { ModelEntry } from "./settings";
import { getSettingsSnapshot, setSettings } from "./settings";

/** 由服务器提供、不含密钥的公开配置（/config.json） */
export type HostedPublicConfig = {
  hosted: true;
  models: ModelEntry[];
  defaultModelId?: string;
};

function normalizeBaseUrl(): string {
  const origin = window.location.origin.replace(/\/+$/, "");
  return `${origin}/v1`;
}

export async function loadHostedPublicConfig(): Promise<HostedPublicConfig | null> {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<HostedPublicConfig>;
    if (!data.hosted || !Array.isArray(data.models) || data.models.length === 0) {
      return null;
    }
    return {
      hosted: true,
      models: data.models.filter((m) => m?.id?.trim()),
      defaultModelId: data.defaultModelId,
    };
  } catch {
    return null;
  }
}

export function applyHostedPublicConfig(cfg: HostedPublicConfig): void {
  const models = cfg.models;
  const selectedModelId =
    (cfg.defaultModelId && models.some((m) => m.id === cfg.defaultModelId)
      ? cfg.defaultModelId
      : null) ?? models[0]?.id ?? null;

  const current = getSettingsSnapshot();
  setSettings({
    ...current,
    hosted: true,
    baseUrl: normalizeBaseUrl(),
    apiKey: "",
    models,
    selectedModelId,
  });
}
