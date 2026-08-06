import type { AppContext } from "../../app-context";
import type { GpuInfo } from "../models/types";

type TelemetryPayload = {
  gpus?: unknown;
  ollama?: { models?: unknown };
};

export type RemoteTelemetry = {
  gpus: GpuInfo[];
  models: string[];
};

const number = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const gpus = (payload: TelemetryPayload): GpuInfo[] =>
  Array.isArray(payload.gpus)
    ? payload.gpus.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const gpu = entry as Record<string, unknown>;
        return [
          {
            index: number(gpu["index"]) || index,
            name: typeof gpu["name"] === "string" ? gpu["name"] : `Remote GPU ${index}`,
            memory_total_mb: number(gpu["memory_total_mb"]),
            memory_used_mb: number(gpu["memory_used_mb"]),
            memory_free_mb: number(gpu["memory_free_mb"]),
            utilization_pct: number(gpu["utilization_pct"]),
            temp_c: number(gpu["temp_c"]),
            power_draw: number(gpu["power_draw"]),
            power_limit: number(gpu["power_limit"]),
          },
        ];
      })
    : [];

const models = (payload: TelemetryPayload): string[] =>
  Array.isArray(payload.ollama?.models)
    ? payload.ollama.models.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const model = entry as Record<string, unknown>;
        const name = typeof model["name"] === "string" ? model["name"] : model["model"];
        return typeof name === "string" && name ? [name] : [];
      })
    : [];

export const getRemoteTelemetry = async (context: AppContext): Promise<RemoteTelemetry | null> => {
  const provider = context.config.providers.find((entry) => entry.enabled && entry.metrics_url);
  if (!provider?.metrics_url) return null;
  try {
    const response = await fetch(provider.metrics_url, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return null;
    const payload = (await response.json()) as TelemetryPayload;
    return { gpus: gpus(payload), models: models(payload).map((model) => `${provider.id}/${model}`) };
  } catch {
    return null;
  }
};
