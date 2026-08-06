import { describe, expect, test } from "bun:test";

import { redactLogLine } from "./log-redaction";

const REDACTED = "[redacted]";

describe("redactLogLine", () => {
  describe("authorization and API key headers", () => {
    test("masks a Bearer token after the Authorization header", () => {
      expect(redactLogLine("Authorization: Bearer sk-abc123def456")).toBe(
        `Authorization: Bearer ${REDACTED}`,
      );
    });

    test("masks a lowercase bearer token case-insensitively", () => {
      expect(redactLogLine("authorization: bearer sk-xyz")).toBe(
        `authorization: bearer ${REDACTED}`,
      );
    });

    test("masks an X-Api-Key header at the start of a line", () => {
      expect(redactLogLine("X-Api-Key: my-secret-key-99")).toBe(`X-Api-Key: ${REDACTED}`);
    });

    test("masks an x-api-key header on a line following a newline", () => {
      expect(redactLogLine("info line\nx-api-key: key123")).toBe(
        `info line\nx-api-key: ${REDACTED}`,
      );
    });

    test("does not mask an X-Api-Key header mid-line where it is not line-anchored", () => {
      expect(redactLogLine("Authorization: Bearer tok1 and X-Api-Key: k2")).toBe(
        `Authorization: Bearer ${REDACTED} and X-Api-Key: k2`,
      );
    });
  });

  describe("environment-style assignments", () => {
    test("masks an explicit HF_TOKEN assignment", () => {
      expect(redactLogLine("HF_TOKEN=hf_abc123")).toBe(`HF_TOKEN=${REDACTED}`);
    });

    test("masks an OPENAI_API_KEY assignment after export", () => {
      expect(redactLogLine("export OPENAI_API_KEY=sk-proj-zzz")).toBe(
        `export OPENAI_API_KEY=${REDACTED}`,
      );
    });

    test("masks a generic *_API_KEY assignment", () => {
      expect(redactLogLine("MY_API_KEY=12345")).toBe(`MY_API_KEY=${REDACTED}`);
    });

    test("masks a generic *_TOKEN assignment", () => {
      expect(redactLogLine("GITHUB_TOKEN=ghp_xyz")).toBe(`GITHUB_TOKEN=${REDACTED}`);
    });

    test("masks every credential in a line with multiple assignments", () => {
      expect(redactLogLine("HF_TOKEN=abc OPENAI_API_KEY=def")).toBe(
        `HF_TOKEN=${REDACTED} OPENAI_API_KEY=${REDACTED}`,
      );
    });

    test("does not mask assignments whose keys are not secret-shaped", () => {
      expect(redactLogLine("VALUE=something")).toBe("VALUE=something");
      expect(redactLogLine("Model_API_Key=x")).toBe("Model_API_Key=x");
    });
  });

  describe("JSON-style key/value pairs", () => {
    test("masks a quoted api_key value", () => {
      expect(redactLogLine('{"api_key": "abc"}')).toBe(`{"api_key": "${REDACTED}"}`);
    });

    test("masks a single-quoted token value", () => {
      expect(redactLogLine("'token': 'xyz'")).toBe(`'token': '${REDACTED}'`);
    });

    test("masks an auth_token value while preserving the quote style", () => {
      expect(redactLogLine('{"auth_token": "abc123"}')).toBe(
        `{"auth_token": "${REDACTED}"}`,
      );
    });

    test("leaves neighboring non-secret pairs untouched", () => {
      expect(redactLogLine('{"token": "123", "role": "admin"}')).toBe(
        `{"token": "${REDACTED}", "role": "admin"}`,
      );
    });

    test("does not mask an unquoted token value", () => {
      expect(redactLogLine("token: 12345")).toBe("token: 12345");
    });

    test("does not mask pairs whose keys are not secret names", () => {
      expect(redactLogLine('{"model": "gpt-4o"}')).toBe('{"model": "gpt-4o"}');
      expect(redactLogLine('mode: "fast"')).toBe('mode: "fast"');
    });
  });

  describe("CLI long flags", () => {
    test("masks the value of an --api-key flag", () => {
      expect(redactLogLine("run --api-key sk-abc")).toBe(`run --api-key ${REDACTED}`);
    });

    test("masks the value of a --token flag", () => {
      expect(redactLogLine("run --token 12345")).toBe(`run --token ${REDACTED}`);
    });

    test("does not mask a flag that starts the line without leading whitespace", () => {
      expect(redactLogLine("--api-key sk-abc")).toBe("--api-key sk-abc");
    });
  });

  describe("URL query parameters", () => {
    test("masks an api_key query parameter", () => {
      expect(redactLogLine("?api_key=secret123")).toBe(`?api_key=${REDACTED}`);
    });

    test("masks a secret parameter in the middle of a query string", () => {
      expect(redactLogLine("url?foo=bar&api_key=leak&extra=1")).toBe(
        `url?foo=bar&api_key=${REDACTED}&extra=1`,
      );
    });

    test("masks a token parameter at the end of the line", () => {
      expect(redactLogLine("url?x=1&token=abc123")).toBe(`url?x=1&token=${REDACTED}`);
    });

    test("does not mask query parameters that are not secrets", () => {
      expect(redactLogLine("?model=gpt-4o&stream=true")).toBe("?model=gpt-4o&stream=true");
      expect(redactLogLine("?foo=bar")).toBe("?foo=bar");
    });
  });

  describe("non-sensitive input", () => {
    test("leaves plain text byte-identical", () => {
      expect(redactLogLine("no secrets here")).toBe("no secrets here");
    });

    test("leaves log lines with metrics, errors, and file paths intact", () => {
      expect(redactLogLine("GET /models 200 12ms")).toBe("GET /models 200 12ms");
      expect(redactLogLine("Error: connection refused on port 8080")).toBe(
        "Error: connection refused on port 8080",
      );
      expect(redactLogLine("throughput=100mb/s")).toBe("throughput=100mb/s");
      expect(redactLogLine("/Users/me/data/file.txt")).toBe("/Users/me/data/file.txt");
    });
  });
});
