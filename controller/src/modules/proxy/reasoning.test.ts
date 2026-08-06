import { describe, expect, test } from "bun:test";

import { getDefaultReasoningParser } from "../engines/process/model-runtime-defaults";
import { asRecipeId, type Recipe } from "../models/types";
import {
  REASONING_FIELDS,
  createThinkRewriter,
  exposeReasoningAsContentWhenEmpty,
  firstReasoningField,
  normalizeReasoningAndContentInMessage,
  normalizeToolCallsInMessage,
  shouldBufferImplicitReasoningContent,
  thinkingTagPrefixIsPartial,
} from "./reasoning";

const SERVER_SIDE_REASONING_EXTRACTION_PARSERS = new Set(["glm45", "qwen3"]);

const REASONING_FAMILIES = [
  { family: "minimax-m2", modelId: "MiniMax/M2-7B" },
  { family: "intellect3", modelId: "Intellect3-235B" },
  { family: "mirothinker", modelId: "mirothinker-32b" },
  { family: "glm4", modelId: "glm-4.5" },
  { family: "glm5", modelId: "glm-5.1" },
  { family: "qwen3-thinking", modelId: "Qwen3-32B-thinking" },
  { family: "qwen3", modelId: "Qwen3-32B" },
];

const makeRecipe = (modelId: string): Recipe => {
  return {
    id: asRecipeId(`recipe-${modelId}`),
    name: modelId,
    model_path: modelId,
    served_model_name: null,
    vision: null,
    backend: "vllm",
    runtime: { kind: "managed_venv", ref: "" },
    env_vars: null,
    tensor_parallel_size: 1,
    pipeline_parallel_size: 1,
    max_model_len: 8192,
    gpu_memory_utilization: 0.9,
    kv_cache_dtype: "auto",
    max_num_seqs: 32,
    trust_remote_code: false,
    tool_call_parser: null,
    reasoning_parser: null,
    enable_auto_tool_choice: false,
    quantization: null,
    dtype: null,
    host: "127.0.0.1",
    port: 0,
    python_path: null,
    extra_args: {},
    max_thinking_tokens: null,
    thinking_mode: "",
  };
};

const emittedReasoningParsers = (): Set<string> => {
  const parsers = new Set<string>();
  for (const { modelId } of REASONING_FAMILIES) {
    const parser = getDefaultReasoningParser(makeRecipe(modelId));
    if (parser) parsers.add(parser);
  }
  return parsers;
};

const bufferingReasoningParsers = (): Set<string> => {
  const buffered = new Set<string>();
  for (const parser of emittedReasoningParsers()) {
    if (shouldBufferImplicitReasoningContent("", parser)) buffered.add(parser);
  }
  return buffered;
};

describe("firstReasoningField", () => {
  test("picks the first non-empty reasoning alias in priority order", () => {
    expect(
      firstReasoningField({ reasoning_content: "a", reasoning: "b", reasoning_text: "c" }),
    ).toBe("a");
    expect(firstReasoningField({ reasoning: "b", reasoning_text: "c" })).toBe("b");
    expect(firstReasoningField({ reasoning_text: "c" })).toBe("c");
  });

  test("ignores empty values and records without a reasoning alias", () => {
    expect(firstReasoningField({ reasoning_content: "", reasoning: "" })).toBe("");
    expect(firstReasoningField({ content: "visible" })).toBe("");
    expect(firstReasoningField({})).toBe("");
  });

  test("does not confuse non-string values with reasoning text", () => {
    expect(firstReasoningField({ reasoning_content: 42 })).toBe("");
  });

  test("reasoning field priority matches the alias collapse order", () => {
    expect(REASONING_FIELDS).toEqual(["reasoning_content", "reasoning", "reasoning_text"]);
  });
});

describe("thinkingTagPrefixIsPartial", () => {
  test("detects open tags mid-stream", () => {
    expect(thinkingTagPrefixIsPartial("<thi")).toBe(true);
    expect(thinkingTagPrefixIsPartial("<anal")).toBe(true);
    expect(thinkingTagPrefixIsPartial("<thinking ")).toBe(true);
  });

  test("detects close tags mid-stream", () => {
    expect(thinkingTagPrefixIsPartial("</thi")).toBe(true);
    expect(thinkingTagPrefixIsPartial("</thinking")).toBe(true);
  });

  test("still flags a complete tag because it may gain attributes", () => {
    expect(thinkingTagPrefixIsPartial("<thinking>")).toBe(true);
    expect(thinkingTagPrefixIsPartial("</thinking>")).toBe(true);
    expect(thinkingTagPrefixIsPartial('<think mode="deep">')).toBe(true);
  });

  test("rejects unrelated tags and plain text", () => {
    expect(thinkingTagPrefixIsPartial("<plan>")).toBe(false);
    expect(thinkingTagPrefixIsPartial("answer")).toBe(false);
  });
});

describe("createThinkRewriter", () => {
  test("extracts explicit think blocks into reasoning and leaves the rest visible", () => {
    const rewriter = createThinkRewriter();
    expect(rewriter.rewrite("<thinking>plan</thinking>Hi")).toEqual({
      content: "Hi",
      reasoningAppend: "plan",
    });
  });

  test("carries a partial open tag across stream deltas", () => {
    const rewriter = createThinkRewriter();
    expect(rewriter.rewrite("<thi")).toEqual({ content: "", reasoningAppend: "" });
    expect(rewriter.rewrite("nking>secret")).toEqual({
      content: "",
      reasoningAppend: "secret",
    });
    expect(rewriter.drainCarry()).toBe("");
  });

  test("buffers implicit reasoning before an unpaired close tag", () => {
    const rewriter = createThinkRewriter({ bufferImplicitReasoningContent: true });
    expect(rewriter.rewrite("preface</thinking>answer")).toEqual({
      content: "answer",
      reasoningAppend: "preface",
    });
  });

  test("treats explicit reasoning deltas as reasoning without extra tags", () => {
    const rewriter = createThinkRewriter();
    const delta = rewriter.rewrite("thought", true);
    expect(delta.content).toBe("");
    expect(delta.reasoningAppend).toBe("thought");
  });
});

const messageRecord = (fields: Record<string, unknown>): Record<string, unknown> => fields;

describe("normalizeReasoningAndContentInMessage", () => {
  test("collapses reasoning aliases into reasoning_content", () => {
    const message = messageRecord({ content: "answer", reasoning: "thought" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["reasoning_content"]).toBe("thought");
    expect(message["reasoning"]).toBeUndefined();
    expect(message["reasoning_text"]).toBeUndefined();
    expect(message["content"]).toBe("answer");
  });

  test("promotes the reasoning_text alias into reasoning_content", () => {
    const message = messageRecord({ content: "answer", reasoning_text: "thought" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["reasoning_content"]).toBe("thought");
    expect(message["reasoning_text"]).toBeUndefined();
  });

  test("extracts inline think blocks from content", () => {
    const message = messageRecord({ content: "before <think>hidden</think> after" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["content"]).toBe("before  after");
    expect(message["reasoning_content"]).toBe("hidden");
  });

  test("deduplicates reasoning emitted both inline and in the reasoning field", () => {
    const message = messageRecord({ content: "start <think>same</think> end", reasoning: "same" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["reasoning_content"]).toBe("same");
    expect(message["content"]).toBe("start  end");
  });

  test("leaves multi-part array content untouched", () => {
    const content = [{ type: "text", text: "visible" }];
    const message = messageRecord({ content, reasoning: "thought" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["content"]).toBe(content);
    expect(message["reasoning_content"]).toBe("thought");
  });

  test("removes an empty reasoning_content entirely", () => {
    const message = messageRecord({ content: "answer", reasoning: "" });
    normalizeReasoningAndContentInMessage(message);
    expect(message["reasoning_content"]).toBeUndefined();
  });
});

describe("normalizeToolCallsInMessage", () => {
  test("keeps existing tool_calls untouched", () => {
    const toolCalls = [
      { id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } },
    ];
    const message = messageRecord({ content: "answer", tool_calls: toolCalls });
    expect(normalizeToolCallsInMessage(message)).toBe(false);
    expect(message["tool_calls"]).toBe(toolCalls);
  });

  test("parses a tool call out of content", () => {
    const message = messageRecord({
      content:
        '<tool_call>\n<function=get_weather>\n<arguments>{"city":"SP"}</arguments>\n</tool_call>',
    });
    expect(normalizeToolCallsInMessage(message)).toBe(true);
    const toolCalls = message["tool_calls"] as Array<Record<string, unknown>>;
    expect(Array.isArray(toolCalls)).toBe(true);
    expect(
      ((toolCalls[0]?.["function"] as Record<string, unknown> | undefined)?.["name"]),
    ).toBe("get_weather");
  });

  test("leaves plain content alone", () => {
    const message = messageRecord({ content: "no tools here" });
    expect(normalizeToolCallsInMessage(message)).toBe(false);
    expect(message["tool_calls"]).toBeUndefined();
  });
});

describe("exposeReasoningAsContentWhenEmpty", () => {
  test("promotes reasoning into content for trinity-large-thinking", () => {
    const message = messageRecord({ content: "", reasoning: "inner thought" });
    expect(exposeReasoningAsContentWhenEmpty(message, "trinity-large-thinking")).toBe(true);
    expect(message["content"]).toBe("inner thought");
    expect(message["reasoning_content"]).toBe("inner thought");
  });

  test("reads reasoning_content when no reasoning field is present", () => {
    const message = messageRecord({ content: "", reasoning_content: "inner thought" });
    expect(exposeReasoningAsContentWhenEmpty(message, "Trinity-Large-Thinking")).toBe(true);
    expect(message["content"]).toBe("inner thought");
  });

  test("does not touch other families", () => {
    const message = messageRecord({ content: "", reasoning: "inner thought" });
    expect(exposeReasoningAsContentWhenEmpty(message, "glm-4.5")).toBe(false);
    expect(message["content"]).toBe("");
  });

  test("keeps non-empty content untouched", () => {
    const message = messageRecord({ content: "answer", reasoning: "thought" });
    expect(exposeReasoningAsContentWhenEmpty(message, "trinity-large-thinking")).toBe(false);
    expect(message["content"]).toBe("answer");
  });
});

describe("shouldBufferImplicitReasoningContent", () => {
  test("buffers the deepseek_r1 parser family", () => {
    expect(shouldBufferImplicitReasoningContent("DeepSeek-R1", "deepseek_r1")).toBe(true);
    expect(shouldBufferImplicitReasoningContent("Intellect3-235B", "deepseek_r1")).toBe(true);
    expect(shouldBufferImplicitReasoningContent("mirothinker-32b", "deepseek_r1")).toBe(true);
    expect(shouldBufferImplicitReasoningContent("Qwen3-32B", "deepseek_r1")).toBe(true);
  });

  test("buffers the minimax_m2_append_think parser family", () => {
    expect(shouldBufferImplicitReasoningContent("MiniMax/M2", "minimax_m2_append_think")).toBe(
      true,
    );
  });

  test("does not buffer server-side extraction parsers", () => {
    expect(shouldBufferImplicitReasoningContent("glm-4.5", "glm45")).toBe(false);
    expect(shouldBufferImplicitReasoningContent("Qwen3-32B", "qwen3")).toBe(false);
  });

  test("buffers by model-name markers when no parser flag is set", () => {
    expect(shouldBufferImplicitReasoningContent("deepseek-v3", null)).toBe(true);
    expect(shouldBufferImplicitReasoningContent("qwen3-thinking", null)).toBe(true);
    expect(shouldBufferImplicitReasoningContent("glm-4.5", null)).toBe(false);
    expect(shouldBufferImplicitReasoningContent("Mixtral-8x7B", null)).toBe(false);
  });
});

describe("consistency with model-runtime-defaults", () => {
  test("every default reasoning parser emitted is paired in reasoning.ts", () => {
    const buffered = bufferingReasoningParsers();
    const unpaired: string[] = [];
    for (const { family, modelId } of REASONING_FAMILIES) {
      const parser = getDefaultReasoningParser(makeRecipe(modelId));
      if (!parser) {
        unpaired.push(`${family}: no default reasoning parser`);
        continue;
      }
      const treated =
        buffered.has(parser) || SERVER_SIDE_REASONING_EXTRACTION_PARSERS.has(parser);
      if (!treated) unpaired.push(`${family} (${modelId} -> parser ${parser})`);
    }
    expect(unpaired).toEqual([]);
  });

  test("every parser buffered by reasoning.ts is backed by a runtime-defaults family", () => {
    const emitted = emittedReasoningParsers();
    const orphaned = [...bufferingReasoningParsers()].filter((parser) => !emitted.has(parser));
    expect(orphaned).toEqual([]);
  });

  test("server-side extraction parsers are emitted and never buffered", () => {
    const emitted = emittedReasoningParsers();
    const buffered = bufferingReasoningParsers();
    for (const parser of SERVER_SIDE_REASONING_EXTRACTION_PARSERS) {
      expect(emitted.has(parser)).toBe(true);
      expect(buffered.has(parser)).toBe(false);
    }
  });

  test("each family resolves its default parser to a consistent buffering treatment", () => {
    const buffered = bufferingReasoningParsers();
    const mismatches: string[] = [];
    for (const { family, modelId } of REASONING_FAMILIES) {
      const parser = getDefaultReasoningParser(makeRecipe(modelId));
      if (!parser) continue;
      const expected = buffered.has(parser);
      const actual = shouldBufferImplicitReasoningContent(modelId, parser);
      if (actual !== expected) {
        mismatches.push(`${family}: ${modelId} buffering=${actual}, expected=${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("the family fixture reaches every default reasoning parser the module declares", () => {
    expect([...emittedReasoningParsers()].sort()).toEqual([
      "deepseek_r1",
      "glm45",
      "minimax_m2_append_think",
      "qwen3",
    ]);
  });
});
