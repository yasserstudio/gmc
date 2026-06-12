import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { Readable } from "node:stream";

const getDataSource = vi.fn();
const listDataSources = vi.fn();
const createDataSource = vi.fn();
const updateDataSource = vi.fn();
const fetchDataSource = vi.fn();
const deleteDataSource = vi.fn();

vi.mock("@gmc-cli/auth", () => ({
  resolveAuth: vi.fn(async () => ({
    getAccessToken: async () => "tok",
    getClientEmail: () => "e",
    getProjectId: () => undefined,
  })),
}));

vi.mock("@gmc-cli/api", async (importActual) => {
  const actual = await importActual<typeof import("@gmc-cli/api")>();
  return {
    ...actual,
    MerchantClient: class {
      constructor(_options: unknown) {}
    },
    DataSourcesService: class {
      getDataSource = getDataSource;
      listDataSources = listDataSources;
      createDataSource = createDataSource;
      updateDataSource = updateDataSource;
      fetchDataSource = fetchDataSource;
      deleteDataSource = deleteDataSource;
    },
  };
});

import { createProgram } from "../src/program.js";
import { MerchantApiError } from "@gmc-cli/api";

function run(args: string[]): Promise<unknown> {
  return createProgram().parseAsync(["node", "gmc", ...args]);
}

describe("gmc datasources", () => {
  let writes: string[];
  let errs: string[];
  let savedEnv: Record<string, string | undefined>;
  const ENV = ["GMC_CONFIG_DIR", "GMC_PROFILE", "GMC_ACCOUNT_ID"] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    savedEnv = {};
    for (const key of ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["GMC_CONFIG_DIR"] = join(tmpdir(), "gmc-ds-test-no-config");
    process.env["GMC_ACCOUNT_ID"] = "123";
    writes = [];
    errs = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      errs.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = 0;
  });

  it("list --json emits a { dataSources } envelope", async () => {
    listDataSources.mockResolvedValue([
      { name: "accounts/123/dataSources/55", dataSourceId: "55", displayName: "API feed" },
    ]);

    await run(["datasources", "list", "--json"]);

    const out = JSON.parse(writes.join("")) as { dataSources: { dataSourceId: string }[] };
    expect(out.dataSources[0]?.dataSourceId).toBe("55");
    expect(process.exitCode).toBe(0);
  });

  it("get fetches the data source by id", async () => {
    getDataSource.mockResolvedValue({ name: "accounts/123/dataSources/55", dataSourceId: "55" });

    await run(["datasources", "get", "55", "--json"]);

    expect(getDataSource).toHaveBeenCalledWith("55");
    expect(process.exitCode).toBe(0);
  });

  it("create from flags builds a primary product data source", async () => {
    createDataSource.mockResolvedValue({
      name: "accounts/123/dataSources/55",
      dataSourceId: "55",
      displayName: "API feed",
    });

    await run([
      "datasources",
      "create",
      "--name",
      "API feed",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--json",
    ]);

    expect(createDataSource).toHaveBeenCalledWith({
      displayName: "API feed",
      primaryProductDataSource: { contentLanguage: "en", feedLabel: "US" },
    });
    expect(process.exitCode).toBe(0);
  });

  it("create with --fetch-url adds scheduled fetch settings", async () => {
    createDataSource.mockResolvedValue({ dataSourceId: "55" });

    await run([
      "datasources",
      "create",
      "--name",
      "Nightly",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--fetch-url",
      "https://shop.com/feed.xml",
    ]);

    expect(createDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        fileInput: expect.objectContaining({
          fileName: "feed.xml",
          fetchSettings: expect.objectContaining({
            enabled: true,
            fetchUri: "https://shop.com/feed.xml",
            frequency: "FREQUENCY_DAILY",
          }),
        }),
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("create maps legacy-local, fetch time, timezone and filename", async () => {
    createDataSource.mockResolvedValue({ dataSourceId: "55" });

    await run([
      "datasources",
      "create",
      "--name",
      "Nightly",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--legacy-local",
      "--fetch-url",
      "https://shop.com/x",
      "--fetch-schedule",
      "weekly",
      "--fetch-time",
      "02:30",
      "--fetch-timezone",
      "America/New_York",
      "--fetch-filename",
      "catalog.xml",
    ]);

    const body = createDataSource.mock.calls[0]?.[0] as {
      primaryProductDataSource: { legacyLocal?: boolean };
      fileInput: { fileName: string; fetchSettings: Record<string, unknown> };
    };
    expect(body.primaryProductDataSource.legacyLocal).toBe(true);
    expect(body.fileInput.fileName).toBe("catalog.xml");
    expect(body.fileInput.fetchSettings).toMatchObject({
      frequency: "FREQUENCY_WEEKLY",
      timeOfDay: { hours: 2, minutes: 30 },
      timeZone: "America/New_York",
    });
    expect(process.exitCode).toBe(0);
  });

  it("create with an invalid --fetch-time exits 2", async () => {
    await run([
      "datasources",
      "create",
      "--name",
      "N",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--fetch-url",
      "https://shop.com/x",
      "--fetch-time",
      "25:00",
    ]);
    expect(createDataSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("create with --fetch-* flags but no --fetch-url exits 2", async () => {
    await run([
      "datasources",
      "create",
      "--name",
      "N",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--fetch-schedule",
      "daily",
    ]);
    expect(createDataSource).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("--fetch-* flags require --fetch-url");
    expect(process.exitCode).toBe(2);
  });

  it("create with empty --countries exits 2", async () => {
    await run([
      "datasources",
      "create",
      "--name",
      "N",
      "--content-language",
      "en",
      "--feed-label",
      "US",
      "--countries",
      " , ",
    ]);
    expect(createDataSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("create with both flags and --file exits 2", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gmc-ds-"));
    const file = join(tmp, "conflict.json");
    writeFileSync(file, JSON.stringify({ displayName: "x", supplementalProductDataSource: {} }));
    try {
      await run([
        "datasources",
        "create",
        "--name",
        "N",
        "--content-language",
        "en",
        "--feed-label",
        "US",
        "--file",
        file,
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    expect(createDataSource).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("either create flags or --file");
    expect(process.exitCode).toBe(2);
  });

  it("create reads a DataSource from stdin when no flags/file are given", async () => {
    createDataSource.mockResolvedValue({ dataSourceId: "55" });
    const stdin = Readable.from([
      Buffer.from(JSON.stringify({ displayName: "Piped", supplementalProductDataSource: {} })),
    ]);
    const original = Object.getOwnPropertyDescriptor(process, "stdin");
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
    try {
      await run(["datasources", "create", "--json"]);
    } finally {
      if (original) Object.defineProperty(process, "stdin", original);
    }
    expect(createDataSource).toHaveBeenCalledWith({
      displayName: "Piped",
      supplementalProductDataSource: {},
    });
    expect(process.exitCode).toBe(0);
  });

  it("create from --file posts the parsed DataSource", async () => {
    createDataSource.mockResolvedValue({ dataSourceId: "55" });
    const tmp = mkdtempSync(join(tmpdir(), "gmc-ds-"));
    const file = join(tmp, "create.json");
    writeFileSync(
      file,
      JSON.stringify({ displayName: "From file", supplementalProductDataSource: {} }),
    );

    try {
      await run(["datasources", "create", "--file", file]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    expect(createDataSource).toHaveBeenCalledWith({
      displayName: "From file",
      supplementalProductDataSource: {},
    });
    expect(process.exitCode).toBe(0);
  });

  it("create from flags without --content-language/--feed-label exits 2", async () => {
    await run(["datasources", "create", "--name", "Incomplete"]);

    expect(createDataSource).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("--content-language and --feed-label are required");
    expect(process.exitCode).toBe(2);
  });

  it("create with no flags, file, or stdin exits 2", async () => {
    const had = Object.prototype.hasOwnProperty.call(process.stdin, "isTTY");
    const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    try {
      await run(["datasources", "create"]);
    } finally {
      if (had && original) Object.defineProperty(process.stdin, "isTTY", original);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }

    expect(createDataSource).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it("delete removes the data source and reports it in --json", async () => {
    deleteDataSource.mockResolvedValue(undefined);

    await run(["datasources", "delete", "55", "--json"]);

    expect(deleteDataSource).toHaveBeenCalledWith("55");
    const out = JSON.parse(writes.join("")) as { deleted: string };
    expect(out.deleted).toBe("55");
    expect(process.exitCode).toBe(0);
  });

  it("update --name patches displayName and confirms", async () => {
    updateDataSource.mockResolvedValue({ dataSourceId: "55", displayName: "Renamed" });

    await run(["datasources", "update", "55", "--name", "Renamed"]);

    expect(updateDataSource).toHaveBeenCalledWith("55", { displayName: "Renamed" }, {});
    expect(writes.join("")).toContain("Updated data source 55.");
    expect(process.exitCode).toBe(0);
  });

  it("update --file strips output-only fields from the body", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gmc-ds-"));
    const file = join(tmp, "ds.json");
    writeFileSync(
      file,
      JSON.stringify({
        name: "accounts/123/dataSources/55",
        dataSourceId: "55",
        input: "API",
        displayName: "Renamed",
      }),
    );
    updateDataSource.mockResolvedValue({ dataSourceId: "55" });

    await run(["datasources", "update", "55", "--file", file]);

    expect(updateDataSource).toHaveBeenCalledWith("55", { displayName: "Renamed" }, {});
    rmSync(tmp, { recursive: true, force: true });
  });

  it("update with nothing to change exits 2", async () => {
    // Simulate an interactive terminal so the command doesn't read stdin.
    const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      await run(["datasources", "update", "55"]);

      expect(updateDataSource).not.toHaveBeenCalled();
      expect(errs.join("")).toContain("Nothing to update");
      expect(process.exitCode).toBe(2);
    } finally {
      if (original) Object.defineProperty(process.stdin, "isTTY", original);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  });

  it("fetch triggers an immediate fetch and reports it in --json", async () => {
    fetchDataSource.mockResolvedValue(undefined);

    await run(["datasources", "fetch", "55", "--json"]);

    expect(fetchDataSource).toHaveBeenCalledWith("55");
    expect(JSON.parse(writes.join(""))).toEqual({ fetched: "55" });
    expect(process.exitCode).toBe(0);
  });

  it("exits 2 when no account is configured", async () => {
    delete process.env["GMC_ACCOUNT_ID"];

    await run(["datasources", "list"]);

    expect(listDataSources).not.toHaveBeenCalled();
    expect(errs.join("")).toContain("No Merchant Center account id");
    expect(process.exitCode).toBe(2);
  });

  it("exits 5 when the Merchant API rejects the request", async () => {
    getDataSource.mockRejectedValue(
      new MerchantApiError("Not found (404).", 404, "NOT_FOUND", false),
    );

    await run(["datasources", "get", "55", "--json"]);

    const out = JSON.parse(writes.join("")) as { ok: boolean };
    expect(out.ok).toBe(false);
    expect(process.exitCode).toBe(5);
  });
});
