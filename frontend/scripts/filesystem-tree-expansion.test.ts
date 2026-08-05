import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type { FsEntry } from "@/features/agent/filesystem-types";
import {
  TreeFileList,
  enableExpansionInstrumentation,
  disableExpansionInstrumentation,
  resetExpansionCounters,
  getExpansionCounters,
} from "@/features/agent/ui/filesystem-tree";

function fixture(count: number): FsEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `file-${String(i).padStart(4, "0")}.ts`,
    path: `/root/file-${String(i).padStart(4, "0")}.ts`,
    rel: `file-${String(i).padStart(4, "0")}.ts`,
    kind: "file" as const,
    size: 100 + i,
  }));
}

const defaultProps = {
  searchQuery: "",
  openFile: null as string | null,
  onOpen: () => {},
  onToggleDir: () => {},
  depth: 0,
  expandedDirs: new Set<string>(),
  dirChildren: new Map<string, FsEntry[]>(),
  dirLoading: new Set<string>(),
};

test("expanding a node with 300 children renders exactly 300 entries", () => {
  enableExpansionInstrumentation();
  resetExpansionCounters();

  const entries = fixture(300);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries }));

  const counters = getExpansionCounters();
  // Threshold: one render operation per entry (entriesRendered === fixture.length).
  // Cost doubling (e.g. O(n^2) rendering or duplicate passes) would push
  // entriesRendered >= 600, which fails the assertion below.
  assert.equal(
    counters.entriesRendered,
    entries.length,
    `Expected ${entries.length} rendered entries, got ${counters.entriesRendered}`,
  );

  disableExpansionInstrumentation();
});

test("expanding a node with 500 children renders exactly 500 entries", () => {
  enableExpansionInstrumentation();
  resetExpansionCounters();

  const entries = fixture(500);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries }));

  const counters = getExpansionCounters();
  assert.equal(
    counters.entriesRendered,
    entries.length,
    `Expected ${entries.length} rendered entries, got ${counters.entriesRendered}`,
  );

  disableExpansionInstrumentation();
});

test("empty node renders zero entries", () => {
  enableExpansionInstrumentation();
  resetExpansionCounters();

  renderToString(createElement(TreeFileList, { ...defaultProps, entries: [] }));

  assert.equal(getExpansionCounters().entriesRendered, 0);

  disableExpansionInstrumentation();
});

test("two sequential expansions do not accumulate render count", () => {
  enableExpansionInstrumentation();
  resetExpansionCounters();

  const entries = fixture(300);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries }));

  const first = getExpansionCounters().entriesRendered;
  assert.equal(first, entries.length);

  resetExpansionCounters();

  const smaller = entries.slice(0, 100);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries: smaller }));

  const second = getExpansionCounters().entriesRendered;
  assert.equal(second, 100, "Second expansion counter did not reset; potential listener leak");

  disableExpansionInstrumentation();
});

test("instrumentation disabled does not count renders", () => {
  resetExpansionCounters();

  const entries = fixture(50);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries }));

  assert.equal(getExpansionCounters().entriesRendered, 0);
});

test("cost per entry is constant and does not double with input size", () => {
  enableExpansionInstrumentation();
  resetExpansionCounters();

  const entries = fixture(300);
  renderToString(createElement(TreeFileList, { ...defaultProps, entries }));

  const rendered = getExpansionCounters().entriesRendered;
  const costPerEntry = rendered / entries.length;

  // If cost doubled the test would see costPerEntry >= 2.0.
  // In practice it must be exactly 1.0; any deviation is suspect.
  assert.ok(
    costPerEntry <= 1.5,
    `Expansion cost per entry is ${costPerEntry.toFixed(2)} — above threshold 1.5 (potential doubling)`,
  );

  disableExpansionInstrumentation();
});
