import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { refreshPiModels, resolvePiModelSelection } from "@local-studio/agent-runtime/pi-runtime-models";

test("Pi model refresh pulls and writes models from every configured controller", async () => {
  const previousDataDir = process.env.LOCAL_STUDIO_DATA_DIR;
  const previousHome = process.env.HOME;
  const previousFetch = globalThis.fetch;
  const dataDir = mkdtempSync(path.join(tmpdir(), "local-studio-pi-models-"));
  const requests: Array<{ url: string; authorization: string | null }> = [];

  process.env.LOCAL_STUDIO_DATA_DIR = dataDir;
  process.env.HOME = dataDir;
  writeFileSync(
    path.join(dataDir, "api-settings.json"),
    JSON.stringify({
      backendUrl: "http://primary.test:8080",
      apiKey: "primary-key",
      voiceUrl: "",
      voiceModel: "whisper-large-v3-turbo",
    }),
    "utf8",
  );
  mkdirSync(path.join(dataDir, "pi-agent"));
  writeFileSync(
    path.join(dataDir, "pi-agent", "controllers.json"),
    JSON.stringify([{ url: "http://persisted.test:11434", name: "persisted" }]),
    "utf8",
  );

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("authorization") });
    const data = url.startsWith("http://primary.test:8080")
      ? [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", max_model_len: 528_000 }]
      : url.startsWith("http://persisted.test:11434")
        ? [{ id: "granite4:tiny-h", name: "Granite 4 Tiny H", max_model_len: 128_000 }]
        : [{ id: "qwen3-coder", name: "Qwen3 Coder", max_model_len: 128_000 }];
    return Response.json({ object: "list", data });
  };

  try {
    const result = await refreshPiModels([
      { url: "http://secondary.test:8080", apiKey: "secondary-key", name: "secondary" },
    ]);

    assert.deepEqual(
      requests.map((request) => request.url).sort(),
      [
        "http://persisted.test:11434/v1/models",
        "http://primary.test:8080/v1/models",
        "http://secondary.test:8080/v1/models",
      ],
    );
    assert.deepEqual(
      requests.map((request) => request.authorization),
      ["Bearer primary-key", null, "Bearer secondary-key"],
    );

    assert.deepEqual(
      result.models.map((model) => ({
        id: model.id,
        rawId: model.rawId,
        providerId: model.providerId,
        controllerName: model.controllerName,
      })),
      [
        {
          id: "deepseek-v4-flash",
          rawId: "deepseek-v4-flash",
          providerId: "local-studio",
          controllerName: "primary",
        },
        {
          id: "local-studio-persisted-test-11434/granite4:tiny-h",
          rawId: "granite4:tiny-h",
          providerId: "local-studio-persisted-test-11434",
          controllerName: "persisted",
        },
        {
          id: "local-studio-secondary-test-8080/qwen3-coder",
          rawId: "qwen3-coder",
          providerId: "local-studio-secondary-test-8080",
          controllerName: "secondary",
        },
      ],
    );

    assert.deepEqual(resolvePiModelSelection("deepseek-v4-flash"), {
      providerId: "local-studio",
      modelId: "deepseek-v4-flash",
    });
    assert.deepEqual(resolvePiModelSelection("local-studio-secondary-test-8080/qwen3-coder"), {
      providerId: "local-studio-secondary-test-8080",
      modelId: "qwen3-coder",
    });

    const modelsConfig = JSON.parse(
      readFileSync(path.join(result.agentDir, "models.json"), "utf8"),
    ) as {
      providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
    };
    assert.deepEqual(Object.keys(modelsConfig.providers).sort(), [
      "local-studio",
      "local-studio-persisted-test-11434",
      "local-studio-secondary-test-8080",
    ]);
    assert.deepEqual(modelsConfig.providers["local-studio"]?.models.map((model) => model.id), [
      "deepseek-v4-flash",
    ]);
    assert.deepEqual(
      modelsConfig.providers["local-studio-persisted-test-11434"]?.models.map((model) => model.id),
      ["granite4:tiny-h"],
    );
    assert.deepEqual(
      modelsConfig.providers["local-studio-secondary-test-8080"]?.models.map((model) => model.id),
      ["qwen3-coder"],
    );
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(dataDir, "pi-agent", "controllers.json"), "utf8")),
      [
        { url: "http://primary.test:8080", apiKey: "primary-key", name: "primary" },
        { url: "http://persisted.test:11434", apiKey: "", name: "persisted" },
        { url: "http://secondary.test:8080", apiKey: "secondary-key", name: "secondary" },
      ],
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataDir === undefined) delete process.env.LOCAL_STUDIO_DATA_DIR;
    else process.env.LOCAL_STUDIO_DATA_DIR = previousDataDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
