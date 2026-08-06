import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { LogSession } from "../../../shared/contracts/observability";
import type { UsageStats } from "../../../shared/contracts/usage";
import { loadSession, type SessionEvent } from "./sessions-store";

type SessionFile = { path: string; mtimeMs: number; size: number };

type UsageRecord = {
  sessionId: string;
  model: string;
  timestamp: number;
  prompt: number;
  completion: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
};

type UsageRow = {
  date?: string;
  model: string;
  requests: number;
  successful: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
};

type UsageAccumulator = {
  records: UsageRecord[];
  sessions: Set<string>;
  byModel: Map<string, UsageRow>;
  daily: Map<string, UsageRow>;
  dailyByModel: Map<string, UsageRow>;
  hourly: Map<number, { hour: number; requests: number; successful: number; tokens: number }>;
  cacheHits: number;
  cacheMisses: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
};

function sessionRoot(): string {
  return process.env.PI_CODING_AGENT_DIR
    ? join(process.env.PI_CODING_AGENT_DIR, "sessions")
    : join(homedir(), ".pi", "agent", "sessions");
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return fallback;
}

async function collectSessionFiles(root: string): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      try {
        const details = await stat(path);
        files.push({ path, mtimeMs: details.mtimeMs, size: details.size });
      } catch {}
    }
  };
  await visit(root);
  return files;
}

function usageRecord(
  event: Record<string, unknown>,
  sessionId: string,
  fallbackModel: string | null,
): UsageRecord | null {
  if (event.type !== "message") return null;
  const message = recordValue(event.message);
  if (message.role !== "assistant") return null;
  const usage = recordValue(message.usage);
  const prompt = numberValue(usage.input ?? usage.prompt_tokens);
  const completion = numberValue(usage.output ?? usage.completion_tokens);
  const total = numberValue(usage.totalTokens ?? usage.total_tokens) || prompt + completion;
  if (total <= 0) return null;
  return {
    sessionId,
    model: textValue(message.model) ?? fallbackModel ?? "unknown",
    timestamp: dateValue(message.timestamp, dateValue(event.timestamp, Date.now())),
    prompt,
    completion,
    total,
    cacheRead: numberValue(usage.cacheRead),
    cacheWrite: numberValue(usage.cacheWrite),
  };
}

async function usageRecords(file: SessionFile): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];
  let sessionId = file.path;
  let model: string | null = null;
  const reader = createInterface({
    input: createReadStream(file.path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event.type === "session") sessionId = textValue(event.id) ?? sessionId;
      if (event.type === "model_change") model = textValue(event.modelId) ?? model;
      const record = usageRecord(event, sessionId, model);
      if (record) records.push(record);
    }
  } finally {
    reader.close();
  }
  return records;
}

function upsertRow(
  map: Map<string, UsageRow>,
  key: string,
  model: string,
  record: UsageRecord,
  date?: string,
): void {
  const row = map.get(key) ?? {
    ...(date ? { date } : {}),
    model,
    requests: 0,
    successful: 0,
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
  };
  row.requests += 1;
  row.successful += 1;
  row.total_tokens += record.total;
  row.prompt_tokens += record.prompt;
  row.completion_tokens += record.completion;
  map.set(key, row);
}

function accumulate(records: UsageRecord[]): UsageAccumulator {
  const accumulator: UsageAccumulator = {
    records,
    sessions: new Set(),
    byModel: new Map(),
    daily: new Map(),
    dailyByModel: new Map(),
    hourly: new Map(),
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
  };
  for (const record of records) {
    const timestamp = new Date(record.timestamp);
    const date = timestamp.toISOString().slice(0, 10);
    const hour = timestamp.getUTCHours();
    accumulator.sessions.add(record.sessionId);
    upsertRow(accumulator.byModel, record.model, record.model, record);
    upsertRow(accumulator.daily, date, "all", record, date);
    upsertRow(accumulator.dailyByModel, `${date}\u0000${record.model}`, record.model, record, date);
    const hourly = accumulator.hourly.get(hour) ?? { hour, requests: 0, successful: 0, tokens: 0 };
    hourly.requests += 1;
    hourly.successful += 1;
    hourly.tokens += record.total;
    accumulator.hourly.set(hour, hourly);
    if (record.cacheRead > 0) {
      accumulator.cacheHits += 1;
      accumulator.cacheHitTokens += record.cacheRead;
    }
    if (record.cacheWrite > 0) {
      accumulator.cacheMisses += 1;
      accumulator.cacheMissTokens += record.cacheWrite;
    }
  }
  return accumulator;
}

function changePercent(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

function usageStats(records: UsageRecord[], now = Date.now()): UsageStats {
  const accumulator = accumulate(records);
  const totalTokens = records.reduce((sum, record) => sum + record.total, 0);
  const promptTokens = records.reduce((sum, record) => sum + record.prompt, 0);
  const completionTokens = records.reduce((sum, record) => sum + record.completion, 0);
  const lastHour = records.filter(
    (record) => now - record.timestamp >= 0 && now - record.timestamp <= 3_600_000,
  );
  const lastDay = records.filter(
    (record) => now - record.timestamp >= 0 && now - record.timestamp <= 86_400_000,
  );
  const previousDay = records.filter(
    (record) => now - record.timestamp > 86_400_000 && now - record.timestamp <= 172_800_000,
  );
  const byModel = [...accumulator.byModel.values()].sort((a, b) => b.total_tokens - a.total_tokens);
  const daily = [...accumulator.daily.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const dailyByModel = [...accumulator.dailyByModel.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const hourly = [...accumulator.hourly.values()].sort((a, b) => a.hour - b.hour);
  const totalRequests = records.length;
  return {
    totals: {
      total_tokens: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_requests: totalRequests,
      successful_requests: totalRequests,
      failed_requests: 0,
      success_rate: totalRequests ? 100 : 0,
      unique_sessions: accumulator.sessions.size,
      unique_users: 1,
    },
    latency: { avg_ms: null, p50_ms: null, p95_ms: null, p99_ms: null, min_ms: null, max_ms: null },
    ttft: { avg_ms: null, p50_ms: null, p95_ms: null, p99_ms: null },
    tokens_per_request: {
      avg: totalRequests ? Math.round(totalTokens / totalRequests) : 0,
      avg_prompt: totalRequests ? Math.round(promptTokens / totalRequests) : 0,
      avg_completion: totalRequests ? Math.round(completionTokens / totalRequests) : 0,
      max: byModel.reduce(
        (max, row) => Math.max(max, Math.round(row.total_tokens / row.requests)),
        0,
      ),
      p50: 0,
      p95: 0,
    },
    cache: {
      hits: accumulator.cacheHits,
      misses: accumulator.cacheMisses,
      hit_tokens: accumulator.cacheHitTokens,
      miss_tokens: accumulator.cacheMissTokens,
      hit_rate:
        accumulator.cacheHits + accumulator.cacheMisses
          ? (accumulator.cacheHits / (accumulator.cacheHits + accumulator.cacheMisses)) * 100
          : 0,
    },
    week_over_week: {
      this_week: {
        requests: lastDay.length,
        tokens: lastDay.reduce((sum, record) => sum + record.total, 0),
        successful: lastDay.length,
      },
      last_week: {
        requests: previousDay.length,
        tokens: previousDay.reduce((sum, record) => sum + record.total, 0),
        successful: previousDay.length,
      },
      change_pct: {
        requests: changePercent(lastDay.length, previousDay.length),
        tokens: changePercent(
          lastDay.reduce((sum, record) => sum + record.total, 0),
          previousDay.reduce((sum, record) => sum + record.total, 0),
        ),
      },
    },
    recent_activity: {
      last_hour_requests: lastHour.length,
      last_24h_requests: lastDay.length,
      prev_24h_requests: previousDay.length,
      last_24h_tokens: lastDay.reduce((sum, record) => sum + record.total, 0),
      change_24h_pct: changePercent(lastDay.length, previousDay.length),
    },
    peak_days: daily
      .map((row) => ({ date: row.date ?? "", requests: row.requests, tokens: row.total_tokens }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5),
    peak_hours: hourly
      .map((row) => ({ hour: row.hour, requests: row.requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5),
    by_model: byModel.map((row) => ({
      ...row,
      success_rate: 100,
      avg_tokens: Math.round(row.total_tokens / row.requests),
      avg_latency_ms: null,
      p50_latency_ms: null,
      avg_ttft_ms: null,
      tokens_per_sec: null,
      prefill_tps: null,
      generation_tps: null,
    })),
    daily: daily.map((row) => ({
      date: row.date ?? "",
      requests: row.requests,
      successful: row.successful,
      success_rate: 100,
      total_tokens: row.total_tokens,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      avg_latency_ms: 0,
    })),
    daily_by_model: dailyByModel.map((row) => ({
      ...row,
      date: row.date ?? "",
      success_rate: 100,
    })),
    hourly_pattern: hourly,
  };
}

export async function getPiSessionUsage(): Promise<UsageStats> {
  const files = await collectSessionFiles(sessionRoot());
  const records = (await Promise.all(files.map(usageRecords))).flat();
  return usageStats(records);
}

export async function listPiSessionLogs(): Promise<Array<LogSession & { cwd: string }>> {
  const files = await collectSessionFiles(sessionRoot());
  const sessions: Array<(LogSession & { cwd: string }) | null> = await Promise.all(
    files.map(async (file) => {
      const reader = createInterface({
        input: createReadStream(file.path, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      let id: string | null = null;
      let cwd: string | null = null;
      let createdAt: string | null = null;
      let model: string | null = null;
      try {
        for await (const line of reader) {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event.type === "session") {
            id = textValue(event.id);
            cwd = textValue(event.cwd);
            createdAt = textValue(event.timestamp);
          }
          if (event.type === "model_change") model = textValue(event.modelId) ?? model;
          if (id && cwd && createdAt && model) break;
        }
      } finally {
        reader.close();
      }
      if (!id || !cwd || !createdAt) return null;
      const session: LogSession & { cwd: string } = {
        id,
        cwd,
        backend: "pi-agent",
        created_at: createdAt,
        ended_at: new Date(file.mtimeMs).toISOString(),
        status: "stopped",
      };
      if (model) session.model = model;
      return session;
    }),
  );
  return sessions
    .filter((session): session is LogSession & { cwd: string } => session !== null)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function messageText(event: SessionEvent): string | null {
  const message = recordValue(event.message);
  const content = message.content;
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content
    .flatMap((part) => {
      const value = recordValue(part);
      return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
    })
    .join(" ")
    .trim();
  return text || null;
}

function logLine(event: SessionEvent): string | null {
  const timestamp = textValue(event.timestamp) ?? "";
  if (event.type === "model_change")
    return `${timestamp} model ${textValue(event.modelId) ?? "unknown"}`;
  if (event.type !== "message") return null;
  const message = recordValue(event.message);
  const role = textValue(message.role) ?? "message";
  const model = textValue(message.model);
  const usage = recordValue(message.usage);
  const totals = numberValue(usage.totalTokens ?? usage.total_tokens);
  const text = messageText(event);
  return [timestamp, role, model, totals > 0 ? `${totals} tokens` : null, text]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

export async function loadPiSessionLog(
  cwd: string,
  sessionId: string,
  limit: number,
): Promise<string[]> {
  const session = await loadSession(cwd, sessionId, { tail: limit });
  return session.events
    .map(logLine)
    .filter((line): line is string => line !== null)
    .slice(-limit);
}
