import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createContext, ExitCode, isStructuredError, reportError, emitJson } from "../src/index.js";

describe("createContext", () => {
  it("applies defaults (human output, color on, default profile)", () => {
    expect(createContext()).toEqual({ json: false, color: true, profile: "default" });
  });

  it("carries through provided values including accountId", () => {
    expect(createContext({ json: true, color: false, profile: "prod", accountId: "123" })).toEqual({
      json: true,
      color: false,
      profile: "prod",
      accountId: "123",
    });
  });

  it("omits accountId when not provided", () => {
    expect("accountId" in createContext({ profile: "x" })).toBe(false);
  });
});

describe("ExitCode", () => {
  it("maps failure classes to stable codes", () => {
    expect(ExitCode).toMatchObject({ Success: 0, Error: 1, Usage: 2, Auth: 3, Config: 4 });
  });
});

describe("isStructuredError", () => {
  it("detects an Error carrying a numeric exitCode", () => {
    expect(isStructuredError(Object.assign(new Error("x"), { exitCode: 3 }))).toBe(true);
  });

  it("rejects plain Errors and non-Error objects", () => {
    expect(isStructuredError(new Error("x"))).toBe(false);
    expect(isStructuredError({ exitCode: 3 })).toBe(false);
    expect(isStructuredError(null)).toBe(false);
  });
});

describe("reportError", () => {
  let out: string[];
  let err: string[];

  beforeEach(() => {
    process.exitCode = 0;
    out = [];
    err = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("emits a JSON envelope and the error's own exit code", () => {
    const e = Object.assign(new Error("nope"), {
      exitCode: 4,
      code: "CONFIG_INVALID",
      suggestion: "fix it",
    });
    reportError(e, { json: true });
    expect(JSON.parse(out.join(""))).toEqual({
      ok: false,
      error: { code: "CONFIG_INVALID", message: "nope", suggestion: "fix it" },
    });
    expect(process.exitCode).toBe(4);
  });

  it("writes message and suggestion to stderr in human mode", () => {
    const e = Object.assign(new Error("bad"), { exitCode: 3, code: "X", suggestion: "do this" });
    reportError(e, { json: false });
    expect(err.join("")).toContain("bad");
    expect(err.join("")).toContain("do this");
    expect(out.join("")).toBe("");
    expect(process.exitCode).toBe(3);
  });

  it("falls back to the generic Error exit code for unstructured errors", () => {
    reportError(new Error("boom"), { json: true });
    expect(JSON.parse(out.join(""))).toEqual({ ok: false, error: { message: "boom" } });
    expect(process.exitCode).toBe(ExitCode.Error);
  });

  it("uses the human prefix for unstructured errors in human mode", () => {
    reportError("plain string failure", { json: false }, "gmc thing");
    expect(err.join("")).toBe("gmc thing: plain string failure\n");
  });
});

describe("emitJson", () => {
  it("writes a single compact JSON line to stdout", () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    });
    emitJson({ a: 1, b: "two" });
    vi.restoreAllMocks();
    expect(out.join("")).toBe('{"a":1,"b":"two"}\n');
  });
});
