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

  it("still registers the doctor command", () => {
    const program = createProgram();
    expect(program.commands.find((c) => c.name() === "doctor")).toBeDefined();
  });

  it("exposes the --json global flag", () => {
    const program = createProgram();
    const flags = program.options.map((o) => o.long);
    expect(flags).toContain("--json");
  });
});
