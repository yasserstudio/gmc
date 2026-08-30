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

gmc is **stable and publicly released at `v1.1.0`**. It covers all 13 stable (`v1`) Merchant API sub-APIs, including Loyalty Customers, alongside `doctor`, `preflight` (including SEO and video-link rules), `migrate`, feeds-as-code, an [MCP server](/reference/mcp) for AI assistants, and a first-party [GitHub Action](/guide/github-action) for CI. See the [Google compatibility snapshot](/guide/google-2026-updates), [release](https://github.com/yasserstudio/gmc/releases/tag/v1.1.0), [roadmap](/guide/roadmap), and [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md).

Ready to try it? Head to [Getting started](/guide/getting-started).
