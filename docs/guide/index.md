---
description: "GMC is a free command-line tool for the Google Merchant API — the successor to the Content API for Shopping. Typed, scriptable, and CI-friendly access to Merchant Center accounts and feeds."
---

# What is GMC?

**GMC** is a command-line interface for the [Google Merchant API](https://developers.google.com/merchant/api) — the successor to the Content API for Shopping. It gives you typed, scriptable, CI-friendly access to your Merchant Center accounts and product data.

It is built around three things the Merchant API makes harder than it should be:

- **`gmc doctor`** — catches the _silent_ failure mode where a credential authenticates fine but the Cloud project was never registered / the API was never enabled, so calls return cryptic empty results.
- **[`gmc preflight`](/reference/preflight)** — an offline scanner that flags the attribute, format, and policy problems that get products disapproved, before you upload.
- **[`gmc migrate`](/reference/migrate)** — an assistant for moving off the Content API: scope swaps, price-to-micros, identifier remaps, and the feed-label transfer check.

## Why a CLI

Most Merchant Center work is still done by hand in the web UI. A CLI makes it:

- **scriptable** — feeds become version-controllable JSON you can diff and review;
- **CI-friendly** — `--json` on every command and classed exit codes so pipelines can branch on the failure class;
- **honest** — `doctor` tells you _why_ something is broken instead of returning an empty list.

## Status

gmc is **stable and feature-complete** (latest `v1.0.14`). **All 11 Merchant API sub-APIs are covered** — `accounts` (incl. developer-registration), `products`, `datasources`, `inventory`, `promotions`, `regions`, `reports`, `notifications`, `quota`, `issues`, `conversions`, and `lfp` (Local Feeds Partnership) — alongside the differentiators `doctor`, `preflight`, `migrate`, and feeds-as-code. The API layer tracks Merchant API `v1`. See the [roadmap](/guide/roadmap) for the phase breakdown and the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for what shipped in each release.

Ready to try it? Head to [Getting started](/guide/getting-started).
