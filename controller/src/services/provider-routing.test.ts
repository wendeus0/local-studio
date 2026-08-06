import { describe, expect, test } from "bun:test";
import type { ProviderConfig } from "../config/persisted-config";
import {
  DEFAULT_CHAT_PROVIDER,
  parseProviderModel,
  resolveConfiguredProviderConfig,
  resolveProviderConfig,
} from "./provider-routing";

const openaiConfig: ProviderConfig = {
  id: "openai",
  name: "OpenAI",
  base_url: "https://api.openai.com/v1",
  api_key: "sk-test",
  enabled: true,
};

describe("parseProviderModel", () => {
  test("routes provider/model to the named remote provider", () => {
    expect(parseProviderModel("openai/gpt-x")).toEqual({
      provider: "openai",
      modelId: "gpt-x",
    });
  });

  test("routes provider/model for a provider other than the default", () => {
    expect(parseProviderModel("anthropic/claude-3")).toEqual({
      provider: "anthropic",
      modelId: "claude-3",
    });
  });

  test("trims surrounding whitespace from both parts", () => {
    expect(parseProviderModel("  openai /  gpt-x  ")).toEqual({
      provider: "openai",
      modelId: "gpt-x",
    });
  });

  test("splits on the first slash only", () => {
    expect(parseProviderModel("openai/prefix/model")).toEqual({
      provider: "openai",
      modelId: "prefix/model",
    });
  });

  test("bare identifier with no provider/ prefix falls back to the default provider", () => {
    expect(parseProviderModel("gpt-x")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "gpt-x",
    });
  });

  test("empty string yields the default provider and an empty model id", () => {
    expect(parseProviderModel("")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "",
    });
  });

  test("whitespace-only string behaves like an empty string", () => {
    expect(parseProviderModel("   ")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "",
    });
  });

  test("a bare slash yields the default provider and the slash as model id", () => {
    expect(parseProviderModel("/")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "/",
    });
  });

  test("a leading slash yields the default provider and the whole string as model id", () => {
    expect(parseProviderModel("/gpt-x")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "/gpt-x",
    });
  });

  test("a trailing slash yields the default provider and the whole string as model id", () => {
    expect(parseProviderModel("openai/")).toEqual({
      provider: DEFAULT_CHAT_PROVIDER,
      modelId: "openai/",
    });
  });
});

describe("resolveConfiguredProviderConfig", () => {
  const providers: ProviderConfig[] = [
    openaiConfig,
    { id: "disabled-provider", name: "Disabled", base_url: "http://x", api_key: "k", enabled: false },
    { id: "no-key", name: "NoKey", base_url: "http://x", api_key: "", enabled: true },
  ];

  test("returns base url and api key for an enabled configured provider", () => {
    expect(resolveConfiguredProviderConfig("openai", providers)).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
    });
  });

  test("matches provider id case-insensitively", () => {
    expect(resolveConfiguredProviderConfig("OpenAI", providers)).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
    });
  });

  test("returns null for an unconfigured provider", () => {
    expect(resolveConfiguredProviderConfig("unknown-provider", providers)).toBeNull();
  });

  test("returns null for a disabled provider", () => {
    expect(resolveConfiguredProviderConfig("disabled-provider", providers)).toBeNull();
  });

  test("returns null for a provider without an api key", () => {
    expect(resolveConfiguredProviderConfig("no-key", providers)).toBeNull();
  });

  test("returns null when no providers are configured", () => {
    expect(resolveConfiguredProviderConfig("openai")).toBeNull();
  });
});

describe("resolveProviderConfig", () => {
  test("resolves through the configured provider list", () => {
    expect(resolveProviderConfig("openai", { providers: [openaiConfig] })).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
    });
  });

  test("returns null for a provider absent from the config", () => {
    expect(resolveProviderConfig("openai", { providers: [] })).toBeNull();
  });

  test("returns null when no config is supplied", () => {
    expect(resolveProviderConfig("openai")).toBeNull();
  });
});
