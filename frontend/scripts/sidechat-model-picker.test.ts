import assert from "node:assert/strict";
import test from "node:test";

import { activeSession } from "../src/features/agent/runtime/selectors";
import type { Session } from "../src/features/agent/runtime/types";
import type { AgentModel } from "../src/features/agent/models";
import { patchActiveTab } from "../src/features/agent/workspace/pane-controller";
import { createInitialState } from "../src/features/agent/workspace/store";
import type { WorkspaceState } from "../src/features/agent/workspace/types";
import { resolvePaneModelId } from "../src/features/agent/ui/render-workspace-pane";

function session(id = "s-1", patch: Partial<Session> = {}): Session {
  return {
    id,
    piSessionId: null,
    title: "Session",
    messages: [],
    status: "idle",
    error: "",
    input: "",
    ...patch,
  };
}

function model(id: string, patch: Partial<AgentModel> = {}): AgentModel {
  return {
    id,
    name: id,
    provider: "local-studio",
    contextWindow: 8192,
    maxTokens: 4096,
    active: false,
    reasoning: false,
    vision: false,
    ...patch,
  };
}

function stateWithTabs(tabs: Session[]): WorkspaceState {
  const base = createInitialState();
  const sessions = new Map<string, Session>();
  for (const tab of tabs) sessions.set(tab.id, tab);
  const panesById = new Map<string, { sessionId: string }>();
  let i = 0;
  for (const tab of tabs) {
    const paneId = i === 0 ? base.focusedPaneId : `pane-${tab.id}`;
    panesById.set(paneId, { sessionId: tab.id });
    i++;
  }
  return { ...base, sessions, panesById, hydrated: true, modelsLoading: false };
}

test("resolvePaneModelId prefers session modelId over workspace selectedModel", () => {
  const models = [model("a", { active: true }), model("b", { active: false })];
  assert.equal(resolvePaneModelId("a", "b", models), "a");
});

test("resolvePaneModelId falls back to selectedModel when session modelId is empty", () => {
  const models = [model("a", { active: true })];
  assert.equal(resolvePaneModelId("", "a", models), "a");
  assert.equal(resolvePaneModelId(undefined, "a", models), "a");
});

test("resolvePaneModelId falls back to first active model when both are unset", () => {
  const models = [
    model("inactive-a", { active: false }),
    model("active-b", { active: true }),
    model("inactive-c", { active: false }),
  ];
  assert.equal(resolvePaneModelId("", "", models), "active-b");
});

test("resolvePaneModelId falls back to first model when nothing matches", () => {
  const models = [model("first", { active: false }), model("second", { active: false })];
  assert.equal(resolvePaneModelId(undefined, "", models), "first");
});

test("resolvePaneModelId returns empty string for empty model list", () => {
  assert.equal(resolvePaneModelId(undefined, "", []), "");
});

test("patchActiveTab writes modelId into the correct session", () => {
  const tab1 = session("tab-1");
  const tab2 = session("tab-2");
  const state = stateWithTabs([tab1, tab2]);

  const next = patchActiveTab(state, {
    paneId: state.focusedPaneId,
    patch: { modelId: "gemini-flash" },
  });

  const updated = activeSession(next, state.focusedPaneId);
  assert.equal(updated?.modelId, "gemini-flash");
  assert.equal(updated?.id, "tab-1");
});

test("two sidechat sessions maintain distinct model selections", () => {
  const tab1 = session("tab-1");
  const tab2 = session("tab-2");
  const state = stateWithTabs([tab1, tab2]);

  const pane1 = state.focusedPaneId;
  const pane2 = `pane-${tab2.id}`;

  const s1 = patchActiveTab(state, { paneId: pane1, patch: { modelId: "model-a" } });
  const s2 = patchActiveTab(s1, { paneId: pane2, patch: { modelId: "model-b" } });

  assert.equal(activeSession(s2, pane1)?.modelId, "model-a");
  assert.equal(activeSession(s2, pane2)?.modelId, "model-b");
});

test("model selection is preserved when second pane is modified", () => {
  const tab1 = session("tab-1");
  const tab2 = session("tab-2");
  const state = stateWithTabs([tab1, tab2]);

  const pane1 = state.focusedPaneId;
  const pane2 = `pane-${tab2.id}`;

  const s1 = patchActiveTab(state, { paneId: pane1, patch: { modelId: "gemini-pro" } });
  const s2 = patchActiveTab(s1, { paneId: pane2, patch: { modelId: "claude" } });

  assert.equal(activeSession(s2, pane1)?.modelId, "gemini-pro");
});

test("session without explicit modelId resolves via workspace default", () => {
  const tab1 = session("tab-1");
  const state = stateWithTabs([tab1]);
  const paned = state.focusedPaneId;
  const unresolved = activeSession(state, paned);

  assert.equal(unresolved?.modelId, undefined);
  assert.ok(unresolved);
});

test("patchActiveTab is a no-op when pane does not exist", () => {
  const state = createInitialState();
  const next = patchActiveTab(state, {
    paneId: "nonexistent",
    patch: { modelId: "should-not-apply" },
  });
  assert.equal(next, state);
});
