import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  DataSourcesService,
  dataSourceSegment,
  type DataSource,
  type PrimaryProductDataSource,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, readJsonObject, line } from "./_shared.js";

interface CreateFlags {
  name?: string;
  type?: string;
  contentLanguage?: string;
  feedLabel?: string;
  legacyLocal?: boolean;
  countries?: string;
  fetchUrl?: string;
  fetchSchedule?: string;
  fetchTime?: string;
  fetchTimezone?: string;
  fetchFilename?: string;
  file?: string;
}

interface UpdateFlags {
  name?: string;
  file?: string;
  updateMask?: string;
}

const FREQUENCY: Record<string, string> = {
  daily: "FREQUENCY_DAILY",
  weekly: "FREQUENCY_WEEKLY",
  monthly: "FREQUENCY_MONTHLY",
};

function parseFetchTime(raw: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  if (!match || hours > 23 || minutes > 59) {
    throw new UsageError(`Invalid --fetch-time "${raw}".`, "Use HH:MM (24-hour), e.g. 02:30.");
  }
  return { hours, minutes };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Default fetched-file name from the URL's last path segment (the API requires one). */
function fileNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "feed.txt";
  } catch {
    return "feed.txt";
  }
}

/** True when any primary-product create flag is set (flag mode vs --file/stdin). */
function hasCreateFlags(opts: CreateFlags): boolean {
  return Boolean(
    opts.name ||
    opts.type ||
    opts.contentLanguage ||
    opts.feedLabel ||
    opts.legacyLocal ||
    opts.countries ||
    opts.fetchUrl ||
    opts.fetchSchedule ||
    opts.fetchTime ||
    opts.fetchTimezone ||
    opts.fetchFilename,
  );
}

/** Compose a primary product DataSource from flags (API push, or scheduled fetch). */
function buildDataSourceFromFlags(opts: CreateFlags): DataSource {
  const type = opts.type ?? "primary";
  if (type !== "primary") {
    throw new UsageError(
      `Unsupported --type "${type}" for flag-based create.`,
      "Only --type primary is supported via flags; use --file for supplemental / inventory / promotion sources.",
    );
  }
  if (!opts.name) {
    throw new UsageError(
      "--name is required.",
      'Give the data source a display name, e.g. --name "API feed".',
    );
  }
  if (!opts.contentLanguage || !opts.feedLabel) {
    throw new UsageError(
      "--content-language and --feed-label are required for a primary product data source.",
      "e.g. --content-language en --feed-label US.",
    );
  }
  // The --fetch-* flags only configure a scheduled file fetch — they need a URL.
  if (
    !opts.fetchUrl &&
    (opts.fetchSchedule || opts.fetchTime || opts.fetchTimezone || opts.fetchFilename)
  ) {
    throw new UsageError(
      "--fetch-* flags require --fetch-url.",
      "Add --fetch-url for a scheduled fetch, or drop the --fetch-* flags for an API feed.",
    );
  }
  let countries: string[] | undefined;
  if (opts.countries !== undefined) {
    countries = opts.countries
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (countries.length === 0) {
      throw new UsageError(
        "--countries has no valid entries.",
        "Provide at least one country code, e.g. --countries US,CA.",
      );
    }
  }

  const primary: PrimaryProductDataSource = {
    contentLanguage: opts.contentLanguage,
    feedLabel: opts.feedLabel,
    ...(opts.legacyLocal ? { legacyLocal: true } : {}),
    ...(countries ? { countries } : {}),
  };
  const body: DataSource = { displayName: opts.name, primaryProductDataSource: primary };

  if (opts.fetchUrl) {
    if (!isHttpUrl(opts.fetchUrl)) {
      throw new UsageError(`Invalid --fetch-url "${opts.fetchUrl}".`, "Use an http(s) URL.");
    }
    const frequency = FREQUENCY[(opts.fetchSchedule ?? "daily").toLowerCase()];
    if (!frequency) {
      throw new UsageError(
        `Invalid --fetch-schedule "${opts.fetchSchedule}".`,
        "Use daily, weekly, or monthly.",
      );
    }
    body.fileInput = {
      // fileName is required by the API for a fetch-configured file input.
      fileName: opts.fetchFilename ?? fileNameFromUrl(opts.fetchUrl),
      fetchSettings: {
        enabled: true,
        fetchUri: opts.fetchUrl,
        frequency,
        ...(opts.fetchTime ? { timeOfDay: parseFetchTime(opts.fetchTime) } : {}),
        ...(opts.fetchTimezone ? { timeZone: opts.fetchTimezone } : {}),
      },
    };
  }
  return body;
}

function dataSourceIdOf(ds: DataSource): string {
  return ds.dataSourceId ?? (ds.name ? dataSourceSegment(ds.name) : "—");
}

/** The writable DataSource fields — `name`/`dataSourceId`/`input` are output-only. */
const DATASOURCE_WRITABLE_FIELDS = [
  "displayName",
  "primaryProductDataSource",
  "supplementalProductDataSource",
  "localInventoryDataSource",
  "regionalInventoryDataSource",
  "promotionDataSource",
  "fileInput",
] as const satisfies readonly (keyof DataSource)[];

/**
 * Keep only the writable keys of a parsed `--file` body, dropping the output-only
 * `name`/`dataSourceId`/`input` the API rejects in a PATCH `updateMask`. Mirrors
 * `pickWritable` in `regions.ts`, so a body saved from `datasources get` re-applies cleanly.
 */
function pickWritable(obj: Record<string, unknown>): DataSource {
  const out: Record<string, unknown> = {};
  for (const key of DATASOURCE_WRITABLE_FIELDS) {
    if (key in obj) out[key] = obj[key];
  }
  return out as DataSource;
}

function dataSourceType(ds: DataSource): string {
  if (ds.primaryProductDataSource) return "primary product";
  if (ds.supplementalProductDataSource) return "supplemental";
  if (ds.localInventoryDataSource) return "local inventory";
  if (ds.regionalInventoryDataSource) return "regional inventory";
  if (ds.promotionDataSource) return "promotion";
  return "—";
}

function renderDataSources(list: DataSource[]): void {
  if (list.length === 0) {
    process.stdout.write("No data sources.\n");
    return;
  }
  const rows = list.map((ds) => ({
    id: dataSourceIdOf(ds),
    name: ds.displayName ?? "—",
    type: dataSourceType(ds),
    input: ds.input ?? "—",
  }));
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  process.stdout.write(`${list.length} data source(s):\n`);
  for (const r of rows) {
    process.stdout.write(
      `  ${r.id.padEnd(idWidth)}  ${r.name.padEnd(nameWidth)}  ${r.type} · ${r.input}\n`,
    );
  }
}

function renderDataSource(ds: DataSource): void {
  line("ID", dataSourceIdOf(ds));
  if (ds.displayName) line("Name", ds.displayName);
  line("Type", dataSourceType(ds));
  if (ds.input) line("Input", ds.input);
  const p = ds.primaryProductDataSource;
  if (p?.feedLabel || p?.contentLanguage)
    line("Feed", [p?.feedLabel, p?.contentLanguage].filter(Boolean).join(" / "));
  if (p?.legacyLocal) line("Legacy local", "yes");
  if (p?.countries?.length) line("Countries", p.countries.join(", "));
  const fetch = ds.fileInput?.fetchSettings;
  if (fetch?.fetchUri)
    line("Fetch", `${fetch.fetchUri}${fetch.frequency ? ` (${fetch.frequency})` : ""}`);
}

/** Register the `gmc datasources` command group (list / get / create / update / fetch / delete). */
export function registerDataSourcesCommands(program: Command): void {
  const datasources = program
    .command("datasources")
    .description("Manage Merchant Center data sources (product feeds)");

  datasources
    .command("list")
    .description("List data sources for the account")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new DataSourcesService(await clientFor(ctx, account));
        const list = await service.listDataSources();
        if (ctx.json) emitJson({ dataSources: list });
        else renderDataSources(list);
      } catch (err) {
        reportError(err, { json }, "gmc datasources list");
      }
    });

  datasources
    .command("get")
    .argument("<dataSourceId>", "Data source id or resource name (from `datasources list`)")
    .description("Fetch one data source")
    .action(async (dataSourceId: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new DataSourcesService(await clientFor(ctx, account));
        const result = await service.getDataSource(dataSourceId);
        if (ctx.json) emitJson(result);
        else renderDataSource(result);
      } catch (err) {
        reportError(err, { json }, "gmc datasources get");
      }
    });

  datasources
    .command("create")
    .description("Create a data source (primary product feed) from flags or JSON")
    .option("--name <displayName>", "Display name")
    .option("--type <type>", "Source type (primary; use --file for other types)")
    .option("--content-language <lang>", "Content language, e.g. en")
    .option("--feed-label <label>", "Feed label, e.g. US")
    .option("--legacy-local", "Mark as a legacy-local feed (products sold only in physical stores)")
    .option("--countries <list>", "Comma-separated target countries, e.g. US,CA")
    .option("--fetch-url <uri>", "Make it a scheduled file fetch from this URL")
    .option("--fetch-schedule <freq>", "daily | weekly | monthly (default daily)")
    .option("--fetch-time <HH:MM>", "Fetch time of day (24-hour)")
    .option("--fetch-timezone <tz>", "Fetch time zone, e.g. America/New_York")
    .option("--fetch-filename <name>", "Fetched file name (default derived from --fetch-url)")
    .option("--file <path>", "Create from a full DataSource JSON file (else stdin)")
    .action(async (opts: CreateFlags) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);

        if (opts.file && hasCreateFlags(opts)) {
          throw new UsageError(
            "Pass either create flags or --file, not both.",
            "Use flags for a primary product feed, or --file / stdin for a full DataSource.",
          );
        }

        let body: DataSource;
        if (opts.file) {
          body = (await readJsonObject(opts.file, "data source")) as DataSource;
        } else if (hasCreateFlags(opts)) {
          body = buildDataSourceFromFlags(opts);
        } else if (!process.stdin.isTTY) {
          body = (await readJsonObject(undefined, "data source")) as DataSource;
        } else {
          throw new UsageError(
            "Nothing to create.",
            "Provide flags (--name --content-language --feed-label …), or a full DataSource via --file / stdin.",
          );
        }

        const service = new DataSourcesService(await clientFor(ctx, account));
        const result = await service.createDataSource(body);
        if (ctx.json) {
          emitJson(result);
        } else {
          const id = dataSourceIdOf(result);
          const name = result.displayName ? `${result.displayName} ` : "";
          process.stdout.write(`Created data source ${name}(${id}).\n`);
          process.stdout.write(`Use it with: gmc products insert --data-source ${id} …\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc datasources create");
      }
    });

  datasources
    .command("update")
    .argument("<dataSourceId>", "Data source id or resource name (from `datasources list`)")
    .option("--name <displayName>", "New display name")
    .option("--file <path>", "Read the DataSource JSON body from this file (else stdin)")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch a data source (only the fields you pass are changed)")
    .action(async (dataSourceId: string, opts: UpdateFlags) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        // Read a body from --file, or from stdin only when no flags were given (so
        // `update <id> --name X` doesn't block on stdin in a non-TTY/CI context).
        let body: DataSource = {};
        if (opts.file || (opts.name === undefined && !process.stdin.isTTY)) {
          body = pickWritable(await readJsonObject(opts.file, "data source"));
        }
        if (opts.name !== undefined) body.displayName = opts.name;
        if (Object.keys(body).length === 0) {
          throw new UsageError(
            "Nothing to update.",
            "Pass --name, or a DataSource body via --file / stdin.",
          );
        }
        const service = new DataSourcesService(await clientFor(ctx, account));
        const result = await service.updateDataSource(dataSourceId, body, {
          ...(opts.updateMask ? { updateMask: opts.updateMask } : {}),
        });
        if (ctx.json) emitJson(result);
        else process.stdout.write(`Updated data source ${dataSourceSegment(dataSourceId)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc datasources update");
      }
    });

  datasources
    .command("fetch")
    .argument("<dataSourceId>", "Data source id or resource name (from `datasources list`)")
    .description("Trigger an immediate fetch of a scheduled file feed (file-input sources only)")
    .action(async (dataSourceId: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new DataSourcesService(await clientFor(ctx, account));
        await service.fetchDataSource(dataSourceId);
        const id = dataSourceSegment(dataSourceId);
        if (ctx.json) emitJson({ fetched: id });
        else process.stdout.write(`Triggered fetch for data source ${id}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc datasources fetch");
      }
    });

  datasources
    .command("delete")
    .argument("<dataSourceId>", "Data source id or resource name (from `datasources list`)")
    .description("Delete a data source")
    .action(async (dataSourceId: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new DataSourcesService(await clientFor(ctx, account));
        await service.deleteDataSource(dataSourceId);
        if (ctx.json) emitJson({ deleted: dataSourceSegment(dataSourceId) });
        else process.stdout.write(`Deleted data source ${dataSourceSegment(dataSourceId)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc datasources delete");
      }
    });
}
