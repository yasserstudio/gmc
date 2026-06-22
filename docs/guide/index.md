---
description: "GMC is a free command-line tool for the Google Merchant API — the successor to the Content API for Shopping. Typed, scriptable, and CI-friendly access to Merchant Center accounts and feeds."
---

# What is GMC?

**GMC** is a command-line interface for the [Google Merchant API](https://developers.google.com/merchant/api) — the successor to the Content API for Shopping. It gives you typed, scriptable, CI-friendly access to your Merchant Center accounts and product data.

It is built around things the Merchant API makes harder than they should be:

- **`gmc doctor`** — catches the _silent_ failure mode where a credential authenticates fine but the Cloud project was never registered / the API was never enabled, so calls return cryptic empty results.
- **[`gmc preflight`](/reference/preflight)** — an offline scanner that flags the attribute, format, policy, and SEO problems that get products disapproved or buried, before you upload.
- **[`gmc migrate`](/reference/migrate)** — an assistant for moving off the Content API: scope swaps, price-to-micros, identifier remaps, and the feed-label transfer check.
- **[`gmc mcp`](/reference/mcp)** — an MCP server that exposes 12 tools to AI assistants like Claude Desktop, Cursor, and VS Code Copilot.
- **[GitHub Action](/guide/github-action)** — a first-party CI gate with inline PR annotations, a findings summary, and structured outputs.

## Why a CLI

Most Merchant Center work is still done by hand in the web UI. A CLI makes it:

- **scriptable** — feeds become version-controllable JSON you can diff and review;
- **CI-friendly** — `--json` on every command and classed exit codes so pipelines can branch on the failure class;
- **honest** — `doctor` tells you _why_ something is broken instead of returning an empty list.

## Status

gmc is **stable, feature-complete, and publicly launched** (latest `v1.0.15`) — see the [launch announcement](https://github.com/yasserstudio/gmc/discussions/100). **All 11 Merchant API sub-APIs are covered** — `accounts` (incl. developer-registration), `products`, `datasources`, `inventory`, `promotions`, `regions`, `reports`, `notifications`, `quota`, `issues`, `conversions`, and `lfp` (Local Feeds Partnership) — alongside the differentiators `doctor`, `preflight` (incl. SEO optimization rules), `migrate`, feeds-as-code, an [MCP server](/reference/mcp) for AI assistants, and a first-party [GitHub Action](/guide/github-action) for CI. The API layer tracks Merchant API `v1`. See the [roadmap](/guide/roadmap) for the phase breakdown and the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for what shipped in each release.

Ready to try it? Head to [Getting started](/guide/getting-started).
