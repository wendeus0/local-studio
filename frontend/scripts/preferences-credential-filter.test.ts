import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeControllersPreference,
  withoutControllerCredentials,
} from "@/lib/desktop-ui-preferences";

const CONTROLLERS_KEY = "local-studio.controllers";

test("save filter strips controllers key from preferences payload", () => {
  const prefs = {
    "local-studio-state": JSON.stringify({ themeId: "zai-dark" }),
    [CONTROLLERS_KEY]: JSON.stringify([
      { url: "http://local:8080", apiKey: "secret-local", name: "Local" },
      { url: "http://remote:8080", apiKey: "secret-remote", name: "Remote" },
    ]),
    "local-studio-setup-complete": "true",
  };

  const filtered = withoutControllerCredentials(prefs);

  assert.equal(filtered[CONTROLLERS_KEY], undefined);
  assert.equal(filtered["local-studio-state"], prefs["local-studio-state"]);
  assert.equal(filtered["local-studio-setup-complete"], prefs["local-studio-setup-complete"]);
  assert.equal(Object.keys(filtered).length, 2);
});

test("save filter does not mutate the original preferences object", () => {
  const prefs = {
    [CONTROLLERS_KEY]: JSON.stringify([
      { url: "http://local:8080", apiKey: "secret", name: "Local" },
    ]),
    "local-studio-setup-complete": "true",
  };

  withoutControllerCredentials(prefs);

  assert.equal(typeof prefs[CONTROLLERS_KEY], "string");
  assert.equal(prefs["local-studio-setup-complete"], "true");
});

test("save filter handles empty preferences without controllers key", () => {
  const prefs = {
    "local-studio-state": JSON.stringify({ themeId: "zai-dark" }),
    "local-studio-setup-complete": "true",
  };

  const filtered = withoutControllerCredentials(prefs);

  assert.deepEqual(filtered, prefs);
  assert.equal(Object.keys(filtered).length, 2);
});

test("save filter handles empty record gracefully", () => {
  const filtered = withoutControllerCredentials({});
  assert.deepEqual(filtered, {});
});

test("hydrate preserves local apiKey when remote sends a different one", () => {
  const local = JSON.stringify([
    { url: "http://local:8080", apiKey: "local-secret", name: "My Local" },
  ]);
  const remote = JSON.stringify([
    { url: "http://local:8080", apiKey: "override-attempt", name: "Remote Copy" },
  ]);

  const merged = mergeControllersPreference(local, remote);

  assert.equal(merged, null);
});

test("hydrate adopts remote controller with apiKey when local has none", () => {
  const local = JSON.stringify([{ url: "http://existing:8080", name: "Existing" }]);
  const remote = JSON.stringify([
    { url: "http://new:8080", apiKey: "remote-secret", name: "New Remote" },
  ]);

  const merged = mergeControllersPreference(local, remote);
  assert.notEqual(merged, null);

  const parsed = JSON.parse(merged!);
  assert.equal(parsed.length, 2);
  const newRemote = parsed.find((c: { url: string }) => c.url === "http://new:8080");
  assert.equal(newRemote?.apiKey, "remote-secret");
});

test("hydrate preserves all local apiKeys when remote has mixed credentials", () => {
  const local = JSON.stringify([
    { url: "http://a:8080", apiKey: "key-a", name: "A" },
    { url: "http://b:8080", apiKey: "", name: "B" },
    { url: "http://c:8080", apiKey: "key-c", name: "C" },
  ]);
  const remote = JSON.stringify([
    { url: "http://a:8080", apiKey: "stale-a", name: "A Remote" },
    { url: "http://b:8080", apiKey: "key-b-remote", name: "B Remote" },
    { url: "http://c:8080", name: "C Remote" },
  ]);

  const merged = mergeControllersPreference(local, remote);
  assert.notEqual(merged, null);

  const parsed: Array<{ url: string; apiKey?: string; name?: string }> = JSON.parse(merged!);
  assert.equal(parsed.length, 3);
  assert.equal(parsed.find((c) => c.url === "http://a:8080")?.apiKey, "key-a");
  assert.equal(parsed.find((c) => c.url === "http://b:8080")?.apiKey, "key-b-remote");
  assert.equal(parsed.find((c) => c.url === "http://c:8080")?.apiKey, "key-c");
});
