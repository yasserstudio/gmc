import { describe, it, expect } from "vitest";
import { createProgram } from "../src/program.js";

describe("createProgram", () => {
  it("is named gmc", () => {
    expect(createProgram().name()).toBe("gmc");
  });

  it("registers the auth command group with whoami and test subcommands", () => {
    const program = createProgram();
    const auth = program.commands.find((c) => c.name() === "auth");
    expect(auth).toBeDefined();
    const subs = (auth?.commands ?? []).map((c) => c.name());
    expect(subs).toContain("login");
    expect(subs).toContain("logout");
    expect(subs).toContain("whoami");
    expect(subs).toContain("test");
  });

  it("registers the config command group with path, list and current", () => {
    const program = createProgram();
    const config = program.commands.find((c) => c.name() === "config");
    expect(config).toBeDefined();
    const subs = (config?.commands ?? []).map((c) => c.name());
    expect(subs).toEqual(expect.arrayContaining(["path", "list", "current"]));
  });

  it("still registers the doctor command", () => {
    const program = createProgram();
    expect(program.commands.find((c) => c.name() === "doctor")).toBeDefined();
  });

  it("registers the accounts command group with list, get and info", () => {
    const program = createProgram();
    const accounts = program.commands.find((c) => c.name() === "accounts");
    expect(accounts).toBeDefined();
    const subs = (accounts?.commands ?? []).map((c) => c.name());
    expect(subs).toEqual(expect.arrayContaining(["list", "get", "info"]));
  });

  it("registers the products command group with insert, get, list and delete", () => {
    const program = createProgram();
    const products = program.commands.find((c) => c.name() === "products");
    expect(products).toBeDefined();
    const subs = (products?.commands ?? []).map((c) => c.name());
    expect(subs).toEqual(expect.arrayContaining(["insert", "get", "list", "delete"]));
  });

  it("exposes the global flags (--json, --profile, --account, --no-color)", () => {
    const program = createProgram();
    const flags = program.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(["--json", "--profile", "--account", "--no-color"]));
  });
});
