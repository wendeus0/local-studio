import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionReplayQueue,
  type ReplayDrainCounters,
} from "../src/features/agent/workspace/replay-queue";
import type { Session, SessionId } from "../src/features/agent/runtime/types";
import type { PaneId, PaneState } from "../src/features/agent/workspace/types";

type Replay = { handleSessionId: string; piSessionId: string };

function makeSession(id: SessionId, patch: Partial<Session> = {}): Session {
  return {
    id,
    piSessionId: null,
    title: "t",
    messages: [],
    status: "running",
    error: "",
    input: "",
    ...patch,
  };
}

function harness(options: { instrument?: boolean } = {}) {
  const instrument = options.instrument ?? true;
  const timers: Array<() => void> = [];
  const handles = new Map<
    PaneId,
    { sessionId: string; loadAndReplay: (piSessionId: string) => void }
  >();
  const panesById = new Map<PaneId, PaneState>();
  const sessions = new Map<SessionId, Session>();
  const replays: Replay[] = [];

  const queue = createSessionReplayQueue({
    getHandle: (paneId) => handles.get(paneId),
    getState: () => ({ panesById, sessions }),
    setTimeout: (handler) => {
      timers.push(handler);
    },
    instrument,
  });

  const flush = () => {
    while (timers.length > 0) {
      const run = timers.shift();
      if (run) run();
    }
  };

  const setHandle = (paneId: PaneId, sessionId: string) => {
    handles.set(paneId, {
      sessionId,
      loadAndReplay: (piSessionId) => {
        replays.push({ handleSessionId: sessionId, piSessionId });
      },
    });
  };

  const setPaneSession = (paneId: PaneId, session: Session) => {
    panesById.set(paneId, { kind: "chat", sessionId: session.id });
    sessions.set(session.id, session);
  };

  const counters = (): Record<PaneId, ReplayDrainCounters> => queue.debugCounters();

  return { queue, replays, flush, setHandle, setPaneSession, counters };
}

test("holds the pending replay while the pane still shows the stale handle, then replays once the matching handle registers", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("new", { piSessionId: "pi-a" }));
  h.setHandle("p1", "old");

  h.queue.queue("p1", "pi-a");
  h.flush();
  assert.equal(h.replays.length, 0);

  h.setHandle("p1", "new");
  h.queue.notifyHandleRegistered("p1");
  h.flush();

  assert.equal(h.replays.length, 1);
  assert.deepEqual(h.replays[0], { handleSessionId: "new", piSessionId: "pi-a" });
});

test("drops the pending replay when the pane's session carries a different piSessionId", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: "other" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();
  assert.equal(h.replays.length, 0);

  h.queue.notifyHandleRegistered("p1");
  h.flush();
  assert.equal(h.replays.length, 0);
});

test("drops the pending replay when the pane's session is a fresh empty starter", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, messages: [], status: "idle" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();
  assert.equal(h.replays.length, 0);

  h.queue.notifyHandleRegistered("p1");
  h.flush();
  assert.equal(h.replays.length, 0);
});

test("keeps the pending replay when no handle exists yet, then replays after the matching handle registers", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: "pi-a" }));

  h.queue.queue("p1", "pi-a");
  h.flush();
  assert.equal(h.replays.length, 0);

  h.setHandle("p1", "t");
  h.queue.notifyHandleRegistered("p1");
  h.flush();

  assert.equal(h.replays.length, 1);
  assert.deepEqual(h.replays[0], { handleSessionId: "t", piSessionId: "pi-a" });
});

test("replays only the last-queued piSessionId per pane", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.queue.queue("p1", "pi-b");
  h.flush();

  assert.equal(h.replays.length, 1);
  assert.equal(h.replays[0]?.piSessionId, "pi-b");
});

test("counters: eventsReceived increments per queue call", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.queue.queue("p1", "pi-b");
  h.queue.queue("p1", "pi-c");
  h.flush();

  const c = h.counters();
  assert.equal(c.p1?.eventsReceived, 3);
});

test("counters: eventsDropped when session is a fresh starter", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, messages: [], status: "idle" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();

  const c = h.counters();
  assert.equal(c.p1?.eventsReceived, 1);
  assert.equal(c.p1?.eventsDropped, 1);
  assert.equal(h.replays.length, 0);
});

test("counters: eventsDropped when piSessionId mismatches", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: "other" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();

  const c = h.counters();
  assert.equal(c.p1?.eventsReceived, 1);
  assert.equal(c.p1?.eventsDropped, 1);
  assert.equal(h.replays.length, 0);
});

test("counters: drain timestamps recorded", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();

  const c = h.counters();
  assert.ok(typeof c.p1?.drainStartedAtMs === "number");
  assert.ok(typeof c.p1?.drainCompletedAtMs === "number");
  assert.ok((c.p1?.drainCompletedAtMs ?? 0) >= (c.p1?.drainStartedAtMs ?? 0));
});

test("counters: pane with no events returns empty counters", () => {
  const h = harness();
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "t");

  const c = h.counters();
  assert.equal(c.p1, undefined);
  assert.equal(Object.keys(c).length, 0);
});

test("counters: two panes, pane switch drops stale replay", () => {
  const h = harness();

  h.setPaneSession("p1", makeSession("s1", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "s1");
  h.setPaneSession("p2", makeSession("s2", { piSessionId: null, status: "running" }));
  h.setHandle("p2", "s2");

  h.queue.queue("p1", "pi-1");
  h.queue.queue("p2", "pi-2");

  h.setPaneSession(
    "p1",
    makeSession("s1fresh", { piSessionId: null, messages: [], status: "idle" }),
  );
  h.setHandle("p1", "s1fresh");

  h.flush();

  const c = h.counters();
  assert.equal(h.replays.length, 1);
  assert.equal(h.replays[0]?.piSessionId, "pi-2");

  assert.equal(c.p1?.eventsReceived, 1);
  assert.equal(c.p1?.eventsDropped, 1);
  assert.equal(c.p2?.eventsReceived, 1);
  assert.equal(c.p2?.eventsDropped, 0);
});

test("counters: instrument off allocates no counters", () => {
  const h = harness({ instrument: false });
  h.setPaneSession("p1", makeSession("t", { piSessionId: null, status: "running" }));
  h.setHandle("p1", "t");

  h.queue.queue("p1", "pi-a");
  h.flush();

  assert.equal(h.replays.length, 1);
  const c = h.counters();
  assert.equal(Object.keys(c).length, 0);
});
