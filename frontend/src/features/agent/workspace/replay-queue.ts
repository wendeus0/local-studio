import type { Session, SessionsMap } from "@/features/agent/runtime/types";
import { paneSessionId } from "@/features/agent/runtime/selectors";
import type { PaneId, PaneState } from "@/features/agent/workspace/types";

type PaneReplayHandle = {
  sessionId: string;
  loadAndReplay: (piSessionId: string) => Promise<void> | void;
};

export type ReplayDrainCounters = {
  eventsReceived: number;
  eventsDropped: number;
  drainStartedAtMs: number | null;
  drainCompletedAtMs: number | null;
};

export type SessionReplayQueueDeps = {
  getHandle: (paneId: PaneId) => PaneReplayHandle | undefined;
  getState: () => {
    panesById: ReadonlyMap<PaneId, PaneState>;
    sessions: SessionsMap;
  };
  setTimeout: (handler: () => void, delay: number) => void;
  instrument?: boolean;
};

export type SessionReplayQueue = {
  queue: (paneId: PaneId, piSessionId: string) => void;
  notifyHandleRegistered: (paneId: PaneId) => void;
  debugCounters: () => Readonly<Record<PaneId, Readonly<ReplayDrainCounters>>>;
};

// The replay drop guard is deliberately NARROWER than isEmptyStarterSession:
// typed-but-unsent input or a startedAt stamp still counts as "fresh" here. A
// "+" click (or any swap) replaces a pane's session in place under the same
// paneId; a fresh empty starter has nothing to replay, so a stale pending
// replay landing on it would overwrite the new chat with the old transcript —
// the "+ opens the old chat" bug.
function isFreshStarter(session: Session | undefined): boolean {
  return (
    !!session &&
    session.piSessionId == null &&
    session.messages.length === 0 &&
    session.status === "idle"
  );
}

export function createSessionReplayQueue(deps: SessionReplayQueueDeps): SessionReplayQueue {
  const pending = new Map<PaneId, string>();
  const counters = deps.instrument ? new Map<PaneId, ReplayDrainCounters>() : null;

  const ensureCounters = (paneId: PaneId): ReplayDrainCounters | undefined => {
    if (!counters) return undefined;
    let c = counters.get(paneId);
    if (!c) {
      c = { eventsReceived: 0, eventsDropped: 0, drainStartedAtMs: null, drainCompletedAtMs: null };
      counters.set(paneId, c);
    }
    return c;
  };

  const drain = (paneId: PaneId) => {
    const pendingSessionId = pending.get(paneId);
    if (!pendingSessionId) return;
    const c = ensureCounters(paneId);
    if (c) c.drainStartedAtMs = Date.now();
    const handle = deps.getHandle(paneId);
    if (!handle) return;
    const sessionId = paneSessionId(deps.getState().panesById.get(paneId));
    const current = sessionId ? deps.getState().sessions.get(sessionId) : undefined;
    if (!current || isFreshStarter(current) || current.messages.length > 0) {
      pending.delete(paneId);
      if (c) {
        c.eventsDropped++;
        c.drainCompletedAtMs = Date.now();
      }
      return;
    }
    if (current.piSessionId && current.piSessionId !== pendingSessionId) {
      pending.delete(paneId);
      if (c) {
        c.eventsDropped++;
        c.drainCompletedAtMs = Date.now();
      }
      return;
    }
    if (handle.sessionId !== current.id) return;
    pending.delete(paneId);
    if (c) c.drainCompletedAtMs = Date.now();
    void handle.loadAndReplay(pendingSessionId);
  };

  return {
    queue: (paneId, piSessionId) => {
      pending.set(paneId, piSessionId);
      if (counters) {
        const c = ensureCounters(paneId);
        if (c) c.eventsReceived++;
      }
      deps.setTimeout(() => drain(paneId), 0);
    },
    notifyHandleRegistered: (paneId) => {
      if (pending.has(paneId)) drain(paneId);
    },
    debugCounters: () => {
      if (!counters) return {};
      const snapshot: Record<PaneId, ReplayDrainCounters> = {};
      for (const [k, v] of counters) snapshot[k] = { ...v };
      return snapshot;
    },
  };
}
