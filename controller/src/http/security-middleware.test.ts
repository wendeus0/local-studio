import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../app-context";
import { createMutatingAuthMiddleware } from "./security-middleware";

const API_KEY = "correct-horse-battery-staple";
const UNAUTHORIZED_DETAIL = "Unauthorized";

const appFor = (apiKey: string): Hono => {
  const context = { config: { api_key: apiKey } } as unknown as AppContext;
  const app = new Hono();
  app.use("*", createMutatingAuthMiddleware(context));
  app.get("/models", (ctx) => ctx.json({ ok: true }));
  return app;
};

const request = (app: Hono, headers?: Record<string, string>): Promise<Response> =>
  headers ? app.request("/models", { headers }) : app.request("/models");

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
