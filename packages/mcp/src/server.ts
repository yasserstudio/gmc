import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMerchantClient, runDoctor, type DoctorReport } from "@gmc-cli/core";
import {
  ProductsService,
  AccountsService,
  DataSourcesService,
  IssuesService,
  QuotaService,
  ReportsService,
  type ProductInput,
} from "@gmc-cli/api";
import { loadConfig, resolveProfile, getConfigDir } from "@gmc-cli/config";
import { runPreflight, loadPreflightConfig, type PreflightReport } from "@gmc-cli/preflight";

export interface McpServerOptions {
  profile?: string;
  accountId?: string;
}

interface ResolvedContext {
  configDir: string;
  profile: string;
  accountId?: string;
}

function resolveContext(opts: McpServerOptions): ResolvedContext {
  const configDir = getConfigDir();
  const config = loadConfig(configDir);
  const resolved = resolveProfile(config, {
    profile: opts.profile,
    accountId: opts.accountId,
  });
  return {
    configDir,
    profile: resolved.name,
    accountId: resolved.accountId,
  };
}

function accountOrThrow(ctx: ResolvedContext, accountId?: string): string {
  const id = accountId ?? ctx.accountId;
  if (!id)
    throw new Error(
      "account is required — pass it as a parameter or set a default via `gmc config`.",
    );
  return id;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

export function createGmcMcpServer(opts: McpServerOptions = {}): McpServer {
  const ctx = resolveContext(opts);

  const server = new McpServer({
    name: "gmc",
    version: "1.0.0",
  });

  // ----- doctor -----

  server.tool(
    "doctor",
    "Diagnose auth, GCP-project registration, and Merchant API access. Run this first to verify your setup works.",
    { account: z.string().optional().describe("Merchant Center account id") },
    async ({ account }) => {
      const report: DoctorReport = await runDoctor({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: account ?? ctx.accountId,
      });
      return json(report);
    },
  );

  // ----- accounts -----

  server.tool(
    "accounts_list",
    "List Merchant Center accounts accessible by the current credential.",
    {},
    async () => {
      const client = await createMerchantClient({ configDir: ctx.configDir, profile: ctx.profile });
      const svc = new AccountsService(client);
      const accounts = await svc.listAccounts();
      return json({ accounts, count: accounts.length });
    },
  );

  server.tool(
    "accounts_get",
    "Get details for a specific Merchant Center account.",
    { account: z.string().describe("Merchant Center account id") },
    async ({ account }) => {
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: account,
      });
      const svc = new AccountsService(client);
      const result = await svc.getAccount(account);
      return json(result);
    },
  );

  // ----- products -----

  server.tool(
    "products_list",
    "List products in a Merchant Center account. Returns processed products with status and item-level issues.",
    {
      account: z.string().optional().describe("Merchant Center account id"),
      page_size: z.number().optional().describe("Max products to return (default 50)"),
    },
    async ({ account, page_size }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new ProductsService(client);
      const products = await svc.listProducts({ pageSize: page_size ?? 50 });
      return json({ products, count: products.length });
    },
  );

  server.tool(
    "products_get",
    "Get a single product by its product key (e.g. 'en~US~SKU1').",
    {
      account: z.string().optional().describe("Merchant Center account id"),
      product_id: z.string().describe("Product key, e.g. 'en~US~SKU1'"),
    },
    async ({ account, product_id }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new ProductsService(client);
      const product = await svc.getProduct(product_id);
      return json(product);
    },
  );

  server.tool(
    "products_insert",
    "Insert or update a product in a Merchant Center account.",
    {
      account: z.string().optional().describe("Merchant Center account id"),
      data_source: z.string().describe("Data source id to insert into"),
      product: z.record(z.unknown()).describe("ProductInput JSON object"),
    },
    async ({ account, data_source, product }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new ProductsService(client);
      const result = await svc.insertProductInput(product as ProductInput, data_source);
      return json(result);
    },
  );

  server.tool(
    "products_delete",
    "Delete a product from a Merchant Center account.",
    {
      account: z.string().optional().describe("Merchant Center account id"),
      product_id: z.string().describe("Product key, e.g. 'en~US~SKU1'"),
      data_source: z.string().describe("Data source id the product belongs to"),
    },
    async ({ account, product_id, data_source }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new ProductsService(client);
      await svc.deleteProductInput(product_id, data_source);
      return text(`Deleted product ${product_id} from data source ${data_source}.`);
    },
  );

  // ----- datasources -----

  server.tool(
    "datasources_list",
    "List data sources (feeds) for a Merchant Center account.",
    { account: z.string().optional().describe("Merchant Center account id") },
    async ({ account }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new DataSourcesService(client);
      const dataSources = await svc.listDataSources();
      return json({ dataSources, count: dataSources.length });
    },
  );

  // ----- issues -----

  server.tool(
    "issues_account",
    "Get account-level issues (disapprovals, warnings) for a Merchant Center account.",
    { account: z.string().optional().describe("Merchant Center account id") },
    async ({ account }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new IssuesService(client);
      const issues = await svc.renderAccountIssues();
      return json({ issues, count: issues.length });
    },
  );

  // ----- quota -----

  server.tool(
    "quota_list",
    "List daily Merchant API call quota and current usage.",
    { account: z.string().optional().describe("Merchant Center account id") },
    async ({ account }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new QuotaService(client);
      const groups = await svc.listQuotas();
      return json({ quotaGroups: groups, count: groups.length });
    },
  );

  // ----- reports -----

  server.tool(
    "reports_query",
    "Run an MCQL query against the Merchant Center reports API. Use product_performance_view for clicks/impressions.",
    {
      account: z.string().optional().describe("Merchant Center account id"),
      query: z
        .string()
        .describe(
          'MCQL query string, e.g. \'SELECT offer_id, clicks FROM product_performance_view WHERE date BETWEEN "2026-01-01" AND "2026-01-31"\'',
        ),
    },
    async ({ account, query }) => {
      const acct = accountOrThrow(ctx, account);
      const client = await createMerchantClient({
        configDir: ctx.configDir,
        profile: ctx.profile,
        accountId: acct,
      });
      const svc = new ReportsService(client);
      const rows = await svc.search(query);
      return json({ rows, count: rows.length });
    },
  );

  // ----- preflight -----

  server.tool(
    "preflight",
    "Validate product feed files offline against Merchant Center rules — catches disapprovals before upload. No API call, no auth needed.",
    {
      dir: z
        .string()
        .optional()
        .describe("Directory of product JSON files to scan (default: 'feeds')"),
      strict: z.boolean().optional().describe("Treat warnings as failures"),
    },
    async ({ dir, strict }) => {
      const { readdir, readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const feedDir = dir ?? "feeds";
      let entries: string[];
      try {
        entries = await readdir(feedDir);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: could not read directory "${feedDir}". Run \`gmc feeds pull\` first or pass a valid directory.`,
            },
          ],
          isError: true,
        };
      }

      const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
      const products: ProductInput[] = [];
      const parseErrors: string[] = [];

      for (const file of jsonFiles) {
        try {
          const raw = await readFile(join(feedDir, file), "utf8");
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            products.push(parsed as ProductInput);
          } else {
            parseErrors.push(`${file}: not a JSON object`);
          }
        } catch {
          parseErrors.push(`${file}: invalid JSON`);
        }
      }

      const loaded = loadPreflightConfig({ cwd: feedDir });
      const effectiveConfig = strict !== undefined ? { ...loaded.config, strict } : loaded.config;
      const report: PreflightReport = runPreflight(products, effectiveConfig);

      return json({
        ...report,
        configPath: loaded.path,
        parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
      });
    },
  );

  return server;
}
