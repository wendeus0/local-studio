import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../app-context";
import {
  createMutatingAuthMiddleware,
  createMutatingRateLimitMiddleware,
  createReadRateLimitMiddleware,
} from "./security-middleware";

const API_KEY = "correct-horse-battery-staple";
const UNAUTHORIZED_DETAIL = "Unauthorized";

const appFor = (apiKey: string): Hono => {
  const context = { config: { api_key: apiKey } } as unknown as AppContext;
  const app = new Hono();
  app.use("*", createMutatingAuthMiddleware(context));
  app.get("/models", (ctx) => ctx.json({ ok: true }));
  return app;
};

const request = async (
  app: Hono,
  headers?: Record<string, string>,
): Promise<Response> => {
  const init: RequestInit = headers ? { headers } : {};
  return await app.request("/models", init);
};

describe("safeTokenEquals through the auth middleware", () => {
  test("accepts an exact match", async () => {
    const response = await request(appFor(API_KEY), { authorization: `Bearer ${API_KEY}` });
    expect(response.status).toBe(200);
  });

  test("rejects a same-length token that differs", async () => {
    const sameLengthMismatch = "x".repeat(API_KEY.length);
    const response = await request(appFor(API_KEY), {
      authorization: `Bearer ${sameLengthMismatch}`,
    });
    expect(response.status).toBe(401);
  });

  test("rejects a token whose length differs from the expected one", async () => {
    const truncated = API_KEY.slice(0, 10);
    const response = await request(appFor(API_KEY), { authorization: `Bearer ${truncated}` });
    expect(response.status).toBe(401);
  });
});

describe("auth middleware acceptance and rejection", () => {
  test("accepts the correct bearer token", async () => {
    const response = await request(appFor(API_KEY), { authorization: `Bearer ${API_KEY}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("accepts the correct x-api-key token", async () => {
    const response = await request(appFor(API_KEY), { "x-api-key": API_KEY });
    expect(response.status).toBe(200);
  });

  test("rejects a wrong token with 401 and a bearer challenge", async () => {
    const response = await request(appFor(API_KEY), { authorization: "Bearer not-the-key" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="local-studio-controller"');
    expect(await response.json()).toEqual({ detail: UNAUTHORIZED_DETAIL });
  });

  test("rejects a missing token with 401", async () => {
    const response = await request(appFor(API_KEY));
    expect(response.status).toBe(401);
  });

  test("accepts requests when no api key is configured", async () => {
    const response = await request(appFor(""));
    expect(response.status).toBe(200);
  });
});

const EMPTY_CONTEXT = { config: {} } as unknown as AppContext;

const mutatingApp = (options: { windowMs?: number; maxRequests?: number } = {}): Hono => {
  const app = new Hono();
  app.use("*", createMutatingRateLimitMiddleware(EMPTY_CONTEXT, options));
  app.post("*", (ctx) => ctx.json({ ok: true }));
  app.get("*", (ctx) => ctx.json({ ok: true }));
  return app;
};

const readApp = (options: { windowMs?: number; maxRequests?: number } = {}): Hono => {
  const app = new Hono();
  app.use("*", createReadRateLimitMiddleware(EMPTY_CONTEXT, options));
  app.get("/read", (ctx) => ctx.json({ ok: true }));
  app.get("/health", (ctx) => ctx.json({ ok: true }));
  app.get("/metrics", (ctx) => ctx.json({ ok: true }));
  app.get("/stream", (ctx) => ctx.json({ ok: true }));
  app.get("/models/generate/stream", (ctx) => ctx.json({ ok: true }));
  app.post("/read/post", (ctx) => ctx.json({ ok: true }));
  return app;
};

const mutate = async (
  app: Hono,
  path: string,
  headers?: Record<string, string>,
): Promise<Response> => {
  const init: RequestInit = headers ? { method: "POST", headers } : { method: "POST" };
  return await app.request(path, init);
};

const read = async (
  app: Hono,
  path: string,
  headers?: Record<string, string>,
): Promise<Response> => {
  const init: RequestInit = headers ? { headers } : {};
  return await app.request(path, init);
};

afterEach(() => {
  setSystemTime();
});

describe("rate limiter keys by the extracted client IP", () => {
  test("falls back to a shared bucket when no IP header is present", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/fallback";

    for (let index = 0; index < 3; index++) {
      expect((await mutate(app, path)).status).toBe(200);
    }
    expect((await mutate(app, path)).status).toBe(429);
  });

  test("cf-connecting-ip wins over x-real-ip and x-forwarded-for", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/cf-precedence";
    const withAll = {
      "cf-connecting-ip": "cf",
      "x-real-ip": "real",
      "x-forwarded-for": "fwd",
    };

    for (let index = 0; index < 3; index++) {
      expect((await mutate(app, path, withAll)).status).toBe(200);
    }
    expect((await mutate(app, path, { "cf-connecting-ip": "cf" })).status).toBe(429);
    expect((await mutate(app, path, { "x-real-ip": "real" })).status).toBe(200);
    expect((await mutate(app, path, { "x-forwarded-for": "fwd" })).status).toBe(200);
  });

  test("x-real-ip wins over x-forwarded-for", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/real-precedence";
    const withRealAndForwarded = { "x-real-ip": "real", "x-forwarded-for": "a, b, c" };

    for (let index = 0; index < 3; index++) {
      expect((await mutate(app, path, withRealAndForwarded)).status).toBe(200);
    }
    expect((await mutate(app, path, { "x-real-ip": "real" })).status).toBe(429);
    expect((await mutate(app, path, { "x-forwarded-for": "a, b, c" })).status).toBe(200);
  });

  test("x-forwarded-for keys on the last hop when present alone", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/forwarded-last-hop";

    for (let index = 0; index < 3; index++) {
      expect((await mutate(app, path, { "x-forwarded-for": "a, b, c" })).status).toBe(200);
    }
    expect((await mutate(app, path, { "x-forwarded-for": "c" })).status).toBe(429);
    expect((await mutate(app, path, { "x-forwarded-for": "a" })).status).toBe(200);
  });
});

describe("mutating rate limiter", () => {
  test("rejects the (maxRequests+1)-th mutating request from the same IP within the window", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/n-plus-one";
    const ip = { "x-real-ip": "10.0.0.1" };
    const statuses: number[] = [];

    for (let index = 0; index < 3; index++) {
      statuses.push((await mutate(app, path, ip)).status);
    }
    const rejected = await mutate(app, path, ip);

    expect(statuses).toEqual([200, 200, 200]);
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(rejected.headers.get("retry-after")).not.toBeNull();
    expect(await rejected.json()).toEqual({ detail: "Rate limit exceeded" });
  });

  test("distinct IPs do not share the mutating counter", async () => {
    const app = mutatingApp({ maxRequests: 3 });
    const path = "/mutate/distinct-ips";

    for (let index = 0; index < 3; index++) {
      expect((await mutate(app, path, { "x-real-ip": "10.0.0.1" })).status).toBe(200);
    }
    expect((await mutate(app, path, { "x-real-ip": "10.0.0.1" })).status).toBe(429);
    expect((await mutate(app, path, { "x-real-ip": "10.0.0.2" })).status).toBe(200);
    expect((await mutate(app, path, { "x-real-ip": "10.0.0.2" })).status).toBe(200);
    expect((await mutate(app, path, { "x-real-ip": "10.0.0.2" })).status).toBe(200);
    expect((await mutate(app, path, { "x-real-ip": "10.0.0.2" })).status).toBe(429);
  });

  test("accepts again after the window resets", async () => {
    const app = mutatingApp({ windowMs: 60_000, maxRequests: 2 });
    const path = "/mutate/window-renewal";
    const ip = { "x-real-ip": "10.0.0.1" };

    await mutate(app, path, ip);
    await mutate(app, path, ip);
    expect((await mutate(app, path, ip)).status).toBe(429);

    setSystemTime(Date.now() + 60_001);
    const renewed = await mutate(app, path, ip);
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get("x-ratelimit-remaining")).toBe("1");
  });

  test("does not throttle GET requests", async () => {
    const app = mutatingApp({ maxRequests: 2 });
    for (let index = 0; index < 10; index++) {
      expect((await read(app, "/mutate/get", { "x-real-ip": "10.0.0.1" })).status).toBe(200);
    }
  });
});

describe("read rate limiter", () => {
  test("rejects the (maxRequests+1)-th read request on a non-exempt path", async () => {
    const app = readApp({ maxRequests: 3 });
    const ip = { "x-real-ip": "10.0.0.1" };
    const statuses: number[] = [];

    for (let index = 0; index < 3; index++) {
      statuses.push((await read(app, "/read", ip)).status);
    }
    const rejected = await read(app, "/read", ip);

    expect(statuses).toEqual([200, 200, 200]);
    expect(rejected.status).toBe(429);
  });

  test("exempts monitoring and streaming paths from read throttling", async () => {
    const app = readApp({ maxRequests: 2 });
    for (const path of ["/health", "/metrics", "/stream", "/models/generate/stream"]) {
      for (let index = 0; index < 5; index++) {
        expect((await read(app, path, { "x-real-ip": "10.0.0.1" })).status).toBe(200);
      }
    }
  });

  test("does not throttle mutating requests", async () => {
    const app = readApp({ maxRequests: 2 });
    for (let index = 0; index < 5; index++) {
      expect((await mutate(app, "/read/post", { "x-real-ip": "10.0.0.1" })).status).toBe(200);
    }
  });
});

describe("rate-limit store cap", () => {
  test("evicts the oldest entry when the store exceeds its cap", async () => {
    const app = mutatingApp({ maxRequests: 120 });
    const path = "/mutate/cap";
    const victimIp = { "x-real-ip": "victim" };

    for (let index = 0; index < 121; index++) {
      const response = await mutate(app, path, victimIp);
      if (index === 120) expect(response.status).toBe(429);
    }

    for (let index = 0; index < 10_000; index++) {
      await mutate(app, path, { "x-real-ip": `ip-${index}` });
    }

    expect((await mutate(app, path, victimIp)).status).toBe(200);
  });
});
